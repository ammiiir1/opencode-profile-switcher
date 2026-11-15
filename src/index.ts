import { Model, Plugin, Provider } from "@opencode/plugin"
import {
  chooseInitialProfile,
  createProfileStore,
  persistSelectedProfile,
  readSelectedProfile,
  type Profile,
  type ProfileName,
  type ProfileStore,
} from "./profile-shared"
import { ProfileRpc } from "./rpc"

const REPOSITION_DELAY_MS = 100

type ModelRef = {
  providerID: string
  modelID: string
}

type Assignment = ModelRef & {
  agent: string
  effort?: string
}

type ActiveProfile = {
  name: ProfileName
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

function resolveProfile(name: ProfileName, profile: Profile): ActiveProfile {
  return {
    name,
    fallback: modelRef(profile.model),
    assignments: Object.entries(profile.agent).map(([agent, entry]) => ({
      agent,
      ...modelRef(entry.model),
      effort: entry.reasoningEffort,
    })),
  }
}

const loadActiveProfile = async (
  store: ProfileStore,
  name: ProfileName,
): Promise<ActiveProfile> => resolveProfile(name, await store.load(name))

async function collectSkippedAgents(
  ctx: Plugin.Context,
  profile: Profile,
): Promise<string[]> {
  try {
    const agents = await ctx.agent.list()
    const known = new Set(agents.data.map((agent) => String(agent.id)))

    return Object.keys(profile.agent).filter((agent) => !known.has(agent))
  } catch (error) {
    console.error("[profile] failed to list agents:", error)
    return []
  }
}

export const ProfileServer = Plugin.define({
  id: "profile",

  async setup(ctx) {
    const directory = ctx.location.directory
    const profilesDir = ctx.options.profilesDir
    const defaultProfile = ctx.options.defaultProfile

    if (profilesDir !== undefined && typeof profilesDir !== "string") {
      throw new Error("The profile plugin option profilesDir must be a string")
    }

    if (defaultProfile !== undefined && typeof defaultProfile !== "string") {
      throw new Error("The profile plugin option defaultProfile must be a string")
    }

    const store = await createProfileStore({
      directory,
      profilesDir,
    })

    const initialName = chooseInitialProfile({
      persisted: await readSelectedProfile(directory),
      fallback: defaultProfile,
      profiles: store.profiles,
    })

    const firstProfile = store.profiles[0]?.name

    if (!initialName || !firstProfile) {
      throw new Error(`No model profiles are available in ${store.directory}`)
    }

    let active: ActiveProfile

    try {
      active = await loadActiveProfile(store, initialName)
    } catch (error) {
      if (initialName === firstProfile) throw error
      console.error(
        `[profile] could not load ${initialName}; falling back to ${firstProfile}:`,
        error,
      )
      active = await loadActiveProfile(store, firstProfile)
    }

    let disposed = false
    let pending: Promise<void> = Promise.resolve()

    const controller = new AbortController()

    const timers: {
      model?: ReturnType<typeof setTimeout>
      agent?: ReturnType<typeof setTimeout>
    } = {}

    let modelRegistration: DisposableRegistration | undefined
    let agentRegistration: DisposableRegistration | undefined
    let rpcRegistration: DisposableRegistration | undefined

    const applyModel = () =>
      ctx.model.transform((editor) => {
        const { fallback, assignments } = active

        editor.default.set(fallback.providerID, fallback.modelID)

        const registered = new Set<string>()

        for (const entry of assignments) {
          const effort = entry.effort

          if (!effort) continue

          const key = [entry.providerID, entry.modelID, effort].join("\0")

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

          editor.update(String(model.providerID), String(model.id), (draft) => {
            const variants = (draft.variants ??= [])
            const exists = variants.some((variant) => String(variant.id) === effort)

            if (exists) return

            variants.push({
              id: Model.VariantID.make(effort),
              settings: {
                reasoningEffort: effort,
              },
            })
          })
        }
      })

    const applyAgent = () =>
      ctx.agent.transform((editor) => {
        for (const entry of active.assignments) {
          if (!editor.get(entry.agent)) continue

          editor.update(entry.agent, (agent) => {
            agent.model = {
              providerID: Provider.ID.make(entry.providerID),
              id: Model.ID.make(entry.modelID),
              ...(entry.effort ? { variant: Model.VariantID.make(entry.effort) } : {}),
            }
          })
        }
      })

    const enqueue = (operation: () => Promise<void>): Promise<void> => {
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
      const persisted = await readSelectedProfile(directory)

      const name = chooseInitialProfile({
        persisted,
        fallback: active.name,
        profiles: store.profiles,
      })

      if (!name) {
        throw new Error(`No model profiles are available in ${store.directory}`)
      }

      active = await loadActiveProfile(store, name)
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
            console.error(`[profile] failed to refresh ${domain}:`, error)
          }
        })
      }, REPOSITION_DELAY_MS)
    }

    const pinSession = async (session: SessionInfo) => {
      if (disposed || session.parentID) return

      const assigned = active.assignments.find((entry) => entry.agent === session.agent)

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

      const model = {
        id: target.modelID,
        providerID: target.providerID,
      }

      try {
        try {
          await ctx.session.switchModel({
            sessionID: session.sessionID,
            model: variant ? { ...model, variant } : model,
          })
        } catch (error) {
          if (!variant) throw error

          await ctx.session.switchModel({
            sessionID: session.sessionID,
            model,
          })
        }
      } catch (error) {
        console.error("[profile] failed to configure new session:", error)
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

      void pending.catch(() => {}).then(async () => {
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

      rpcRegistration = await ctx.rpc.register(ProfileRpc, {
        list: async (input) => {
          const { directory: selectedDirectory } = input as { directory: string }

          const profiles = store.profiles.map((profile) => ({
            name: profile.name,
            label: profile.label,
          }))

          const stored = await readSelectedProfile(selectedDirectory)

          if (stored === undefined || !store.has(stored)) {
            return { profiles }
          }

          return { profiles, current: stored }
        },

        select: async (input, context) => {
          const { directory: selectedDirectory, profile: requestedName } = input as {
            directory: string
            profile: string
          }

          let loaded: Profile
          let next: ActiveProfile

          try {
            loaded = await store.load(requestedName)
            next = resolveProfile(requestedName, loaded)
          } catch (error) {
            return context.error(
              "invalid",
              error instanceof Error
                ? error.message
                : `Profile ${requestedName} failed validation`,
              { profile: requestedName },
            )
          }

          const skipped = await collectSkippedAgents(ctx, loaded)

          try {
            await persistSelectedProfile(selectedDirectory, requestedName)
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
            try {
              await enqueue(async () => {
                active = next
                await reposition("model")
                await reposition("agent")
              })
            } catch (error) {
              console.error("[profile] failed to apply the selected profile:", error)
            }
          }

          return {
            profile: requestedName,
            label: store.label(requestedName),
            model: {
              providerID: next.fallback.providerID,
              modelID: next.fallback.modelID,
            },
            skipped,
          }
        },
      })

      void (async () => {
        try {
          for await (const event of ctx.event.subscribe({
            types: ["config.updated", "session.created"],
            signal: controller.signal,
          })) {
            if (disposed) break

            if (event.type === "config.updated") {
              schedule("model")
              schedule("agent")
              continue
            }

            if (event.type === "session.created") {
              if (event.data.location.directory !== directory) continue

              await pinSession(event.data)
            }
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            console.error("[profile] event subscription failed:", error)
          }
        }
      })()

      return dispose
    } catch (error) {
      dispose()
      throw error
    }
  },
})

export default ProfileServer
