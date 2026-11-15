import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import type { Plugin } from "@opencode/plugin"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

type Session = {
  id: string
  parentID?: string
  agent?: string
  location: { directory: string }
  model?: { providerID: string; id: string; variant?: string }
}

type Switch = {
  sessionID: string
  model: { providerID: string; id: string; variant?: string }
}

let root: string
let workspace: string
let server: typeof import("../src/index").ProfileServer
const originalXdg = process.env.XDG_CONFIG_HOME

if (process.env.PROFILE_SESSION_TEST === "1") {
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "profile-session-select-"))
  workspace = join(root, "workspace")
  const profiles = join(root, "config", "opencode", "profiles")
  await mkdir(profiles, { recursive: true })
  await mkdir(workspace)
  await writeFile(join(profiles, "chosen.json"), JSON.stringify({
    model: "fallback/default",
    agent: { build: { model: "assigned/model", reasoningEffort: "high" } },
  }))
  process.env.XDG_CONFIG_HOME = join(root, "config")
  mock.module("../src/reload-command", () => ({ reloadCommand: () => undefined }))
  server = (await import("../src/index")).ProfileServer
})

afterAll(async () => {
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = originalXdg
  await rm(root, { recursive: true, force: true })
})

async function fixture(session: Session, rejectVariant = false, rejectAll = false) {
  const calls: Switch[] = []
  let select!: (input: { directory: string; profile: string; sessionID?: string }, context: unknown) => Promise<unknown>
  const context = {
    location: { directory: workspace },
    model: { transform: async () => ({ dispose: async () => {} }) },
    agent: {
      transform: async () => ({ dispose: async () => {} }),
      list: async () => ({ data: [{ id: "build" }] }),
    },
    rpc: {
      register: async (_rpc: unknown, handlers: { select: typeof select }) => {
        select = handlers.select
        return { dispose: async () => {} }
      },
    },
    event: { subscribe: async function* () {} },
    session: {
      get: async () => session,
      switchModel: async (input: Switch) => {
        calls.push(input)
        if (rejectAll || (rejectVariant && input.model.variant)) throw new Error("rejected")
      },
    },
  }
  const dispose = await server.setup(context as unknown as Plugin.Context)
  return {
    calls,
    select: (input: { directory?: string; sessionID?: string } = {}) =>
      select({ directory: workspace, profile: "chosen", ...input }, {}),
    dispose: () => dispose?.(),
  }
}

describe("profile selection session model", () => {
  test("switches only the supplied root session to its agent assignment", async () => {
    const f = await fixture({ id: "existing", agent: "build", location: { directory: workspace } })
    await f.select({ sessionID: "existing" })
    expect(f.calls).toEqual([{ sessionID: "existing", model: { providerID: "assigned", id: "model", variant: "high" } }])
    expect(JSON.parse(await readFile(join(workspace, ".opencode", "model-profile.json"), "utf8"))).toEqual({ profile: "chosen" })
    await f.dispose()
  })

  test.each(["unknown", undefined])("uses the fallback for agent %s", async (agent) => {
    const f = await fixture({ id: "existing", agent, location: { directory: workspace } })
    await f.select({ sessionID: "existing" })
    expect(f.calls).toEqual([{ sessionID: "existing", model: { providerID: "fallback", id: "default" } }])
    await f.dispose()
  })

  test("does not switch without a session ID", async () => {
    const f = await fixture({ id: "existing", location: { directory: workspace } })
    await f.select()
    expect(f.calls).toEqual([])
    await f.dispose()
  })

  test("does not switch child sessions or sessions in another directory", async () => {
    for (const session of [
      { id: "child", parentID: "root", location: { directory: workspace } },
      { id: "other", location: { directory: root } },
    ]) {
      const f = await fixture(session)
      await f.select({ sessionID: session.id })
      expect(f.calls).toEqual([])
      await f.dispose()
    }
  })

  test("does not switch a session when selecting for another directory", async () => {
    const f = await fixture({ id: "existing", location: { directory: workspace } })
    await f.select({ directory: root, sessionID: "existing" })
    expect(f.calls).toEqual([])
    await f.dispose()
  })

  test("retries without the variant if the server rejects it", async () => {
    const f = await fixture({ id: "existing", agent: "build", location: { directory: workspace } }, true)
    await f.select({ sessionID: "existing" })
    expect(f.calls).toEqual([
      { sessionID: "existing", model: { providerID: "assigned", id: "model", variant: "high" } },
      { sessionID: "existing", model: { providerID: "assigned", id: "model" } },
    ])
    await f.dispose()
  })

  test("logs a failed switch and still saves and returns the profile", async () => {
    const log = mock(() => {})
    const original = console.error
    console.error = log
    try {
      const f = await fixture({ id: "existing", agent: "build", location: { directory: workspace } }, false, true)
      const result = await f.select({ sessionID: "existing" })
      expect(result).toMatchObject({ profile: "chosen" })
      expect(log).toHaveBeenCalled()
      expect(JSON.parse(await readFile(join(workspace, ".opencode", "model-profile.json"), "utf8"))).toEqual({ profile: "chosen" })
      await f.dispose()
    } finally {
      console.error = original
    }
  })
})
} else {
  test("profile selection session behavior in an isolated config", () => {
    const result = spawnSync(process.execPath, ["test", import.meta.path], {
      env: { ...process.env, PROFILE_SESSION_TEST: "1" },
      encoding: "utf8",
    })
    expect(result.stderr + result.stdout).toContain("0 fail")
    expect(result.status).toBe(0)
  })
}
