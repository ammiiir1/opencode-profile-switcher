import type { Plugin } from "@opencode/plugin"
import { spawn } from "node:child_process"
import {
  loadProfile,
  persistSelectedProfile,
  profileLabels,
  readSelectedProfile,
  type Profile,
} from "./profile-shared"
import { ProfileRpc } from "./rpc"

const DEFAULT_PROFILE = "hybrid-deepseek"
const REPOSITION_DELAY_MS = 100
const RELOAD_DELAY_MS = 350
const OPENCODE_EXECUTABLE = "/Users/amir/.opencode/bin/opencode"
const RELOAD_CWD = "/Users/amir"

type ModelRef = {
  providerID: string
  modelID: string
}

type Assignment = ModelRef & {
  agent: string
  effort?: string
}

type ActiveProfile = {
  name: string
  fallback: ModelRef
  assignments: Assignment[]
}

type SessionInfo = {
  readonly sessionID: string
  readonly parentID?: string
  readonly agent?: string
  readonly model?: {
    readonly providerID: string
    readonly id: string
    readonly variant?: string
  }
}

type Domain = "model" | "agent"

type DisposableRegistration = {
  dispose(): Promise<void>
}

function modelRef(model: string): ModelRef {
  const separator = model.indexOf("/")

  if (separator <= 0 || separator === model.length - 1) {
    throw new Error(`Invalid model reference: ${model}`)
  }

  return {
    providerID: model.slice(0, separator),
    modelID: model.slice(separator + 1),
  }
}

function resolveProfile(
  name: string,
  profile: Profile,
): ActiveProfile {
  return {
    name,
    fallback: modelRef(profile.model),
    assignments: Object.entries(profile.agent).map(
      ([agent, entry]) => ({
        agent,
        ...modelRef(entry.model),
        effort: entry.reasoningEffort,
      }),
    ),
  }
}

async function loadActiveProfile(
  name: string,
): Promise<ActiveProfile> {
  return resolveProfile(name, await loadProfile(name))
}

function scheduleServerReload(): void {
  setTimeout(() => {
    const child = spawn(
      OPENCODE_EXECUTABLE,
      ["reload"],
      {
        cwd: RELOAD_CWD,
        detached: true,
        stdio: "ignore",
        shell: false,
      },
    )

    child.on("error", (error) => {
      console.error("[profile] server reload failed:", error)
    })

    child.unref()
  }, RELOAD_DELAY_MS)
}

export const ProfileServer: Plugin.Plugin = {
  id: "profile",

  async setup(ctx) {
    const directory = ctx.location.directory

    const initialName =
      (await readSelectedProfile(directory)) ??
      DEFAULT_PROFILE

    let active = await loadActiveProfile(initialName)
    let disposed = false
    let pending: Promise<void> = Promise.resolve()

    const controller = new AbortController()

    const timers: {
      model?: ReturnType<typeof setTimeout>
      agent?: ReturnType<typeof setTimeout>
    } = {}

    let modelRegistration:
      | DisposableRegistration
      | undefined

    let agentRegistration:
      | DisposableRegistration
      | undefined

    let rpcRegistration:
      | DisposableRegistration
      | undefined

    const applyModel = () =>
      ctx.model.transform((editor) => {
        const { fallback, assignments } = active

        editor.default.set(
          fallback.providerID,
          fallback.modelID,
        )

        const registered = new Set<string>()

        for (const entry of assignments) {
          const effort = entry.effort

          if (!effort) continue

          const key = [
            entry.providerID,
            entry.modelID,
            effort,
          ].join("\0")

          if (registered.has(key)) continue
          registered.add(key)

          const model = editor
            .list(entry.providerID)
            .find(
              (candidate) =>
                String(candidate.modelID) === entry.modelID ||
                String(candidate.id) === entry.modelID,
            )

          if (!model) continue

          editor.update(
            String(model.providerID),
            String(model.id),
            (draft) => {
              const variants = (draft.variants ??= [])

              const exists = variants.some(
                (variant) =>
                  String(variant.id) === effort,
              )

              if (exists) return

              variants.push({
                id: effort as never,
                settings: {
                  reasoningEffort: effort,
                },
              })
            },
          )
        }
      })

    const applyAgent = () =>
      ctx.agent.transform((editor) => {
        for (const entry of active.assignments) {
          editor.update(entry.agent, (agent) => {
            agent.model = {
              providerID: entry.providerID as never,
              id: entry.modelID as never,
              ...(entry.effort
                ? { variant: entry.effort as never }
                : {}),
            }
          })
        }
      })

    const enqueue = (
      operation: () => Promise<void>,
    ): Promise<void> => {
      const next = pending
        .catch(() => {})
        .then(async () => {
          if (disposed) return
          await operation()
        })

      pending = next.catch(() => {})
      return next
    }

    const refreshActive = async () => {
      const selected =
        (await readSelectedProfile(directory)) ??
        DEFAULT_PROFILE

      const next = await loadActiveProfile(selected)

      active = next
    }

    const reposition = async (domain: Domain) => {
      if (disposed) return

      if (domain === "model") {
        await modelRegistration?.dispose()
        modelRegistration = undefined
        modelRegistration = await applyModel()
        return
      }

      await agentRegistration?.dispose()
      agentRegistration = undefined
      agentRegistration = await applyAgent()
    }

    const schedule = (domain: Domain) => {
      if (disposed) return

      const existing = timers[domain]

      if (existing) clearTimeout(existing)

      timers[domain] = setTimeout(() => {
        timers[domain] = undefined

        void enqueue(async () => {
          try {
            await refreshActive()
            await reposition(domain)
          } catch (error) {
            console.error(
              `[profile] failed to refresh ${domain}:`,
              error,
            )
          }
        })
      }, REPOSITION_DELAY_MS)
    }

    const pinSession = async (
      session: SessionInfo,
    ) => {
      if (disposed || session.parentID) return

      const assigned = active.assignments.find(
        (entry) => entry.agent === session.agent,
      )

      const target = assigned ?? active.fallback
      const variant = assigned?.effort
      const current = session.model

      if (
        current?.providerID === target.providerID &&
        current.id === target.modelID &&
        current.variant === variant
      ) {
        return
      }

      try {
        await ctx.session.switchModel({
          sessionID: session.sessionID as never,
          model: {
            providerID: target.providerID as never,
            id: target.modelID as never,
            ...(variant
              ? { variant: variant as never }
              : {}),
          },
        })
      } catch (error) {
        console.error(
          "[profile] failed to configure new session:",
          error,
        )
      }
    }

    const dispose = () => {
      if (disposed) return

      disposed = true
      controller.abort()

      if (timers.model) {
        clearTimeout(timers.model)
        timers.model = undefined
      }

      if (timers.agent) {
        clearTimeout(timers.agent)
        timers.agent = undefined
      }

      void pending
        .catch(() => {})
        .then(async () => {
          await Promise.allSettled([
            modelRegistration?.dispose(),
            agentRegistration?.dispose(),
            rpcRegistration?.dispose(),
          ])
        })
    }

    try {
      modelRegistration = await applyModel()
      agentRegistration = await applyAgent()

      rpcRegistration = await ctx.rpc.register(
        ProfileRpc,
        {
          list: async (input) => {
            const { directory: selectedDirectory } =
              input as {
                directory: string
              }

            const profiles = Object.entries(
              profileLabels,
            ).map(([name, label]) => ({
              name,
              label,
            }))

            const current = await readSelectedProfile(
              selectedDirectory,
            )

            return current === undefined
              ? { profiles }
              : { profiles, current }
          },

          select: async (input, context) => {
            const {
              directory: selectedDirectory,
              profile: requestedName,
            } = input as {
              directory: string
              profile: string
            }

            let loaded: Profile
            let next: ActiveProfile

            try {
              loaded = await loadProfile(requestedName)
              next = resolveProfile(
                requestedName,
                loaded,
              )
            } catch (error) {
              return context.error(
                "invalid",
                error instanceof Error
                  ? error.message
                  : `Profile ${requestedName} failed validation`,
                { profile: requestedName },
              )
            }

            const agents = await ctx.agent.list()

            if (agents?.data) {
              const known = new Set(
                agents.data.map(
                  (agent) => String(agent.id),
                ),
              )

              const unknown = Object.keys(
                loaded.agent,
              ).find(
                (agent) =>
                  !known.has(agent) &&
                  agent !== "general",
              )

              if (unknown) {
                return context.error(
                  "unknown_agent",
                  `Unknown agent: ${unknown}`,
                  { agent: unknown },
                )
              }
            }

            try {
              await persistSelectedProfile(
                selectedDirectory,
                requestedName,
              )
            } catch (error) {
              return context.error(
                "invalid",
                error instanceof Error
                  ? error.message
                  : "Failed to save the selected profile",
                { profile: requestedName },
              )
            }

            if (selectedDirectory === directory) {
              active = next
            }

            const workflow = next.assignments.find(
              (entry) =>
                entry.agent === "workflow",
            )

            const target =
              workflow ?? next.fallback

            const result = {
              profile: requestedName,
              label: profileLabels[requestedName],
              model: {
                providerID: target.providerID,
                modelID: target.modelID,
                ...(workflow?.effort
                  ? { variant: workflow.effort }
                  : {}),
              },
            }

            scheduleServerReload()

            return result
          },
        },
      )

      void (async () => {
        try {
          for await (const event of ctx.event.subscribe({
            types: [
              "config.updated",
              "session.created",
            ],
            signal: controller.signal,
          })) {
            if (disposed) break

            if (event.type === "config.updated") {
              schedule("model")
              schedule("agent")
              continue
            }

            if (event.type === "session.created") {
              if (
                event.data.location.directory !==
                directory
              ) {
                continue
              }

              await pinSession(event.data)
            }
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            console.error(
              "[profile] event subscription failed:",
              error,
            )
          }
        }
      })()

      return dispose
    } catch (error) {
      dispose()
      throw error
    }
  },
}

export default ProfileServer
