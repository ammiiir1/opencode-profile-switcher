import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import {
  bundledProfilesDirectory,
  chooseInitialProfile,
  createProfileStore,
  globalProfilesDirectory,
  parseProfile,
  persistSelectedProfile,
  profileLabel,
  profileStatePath,
  readSelectedProfile,
} from "../src/profile-shared"

const created: string[] = []
const originalXdg = process.env.XDG_CONFIG_HOME

const makeDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "profile-switcher-"))
  created.push(directory)
  return directory
}

const writeProfile = async (directory: string, name: string, text: string) => {
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, `${name}.json`), text, "utf8")
}

const validProfile = (model: string, agentModel = model, effort = "medium") =>
  JSON.stringify({ model, agent: { build: { model: agentModel, reasoningEffort: effort } } })

afterEach(async () => {
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = originalXdg

  await Promise.all(
    created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe("parseProfile", () => {
  test("accepts model references whose model part contains slashes", () => {
    const profile = parseProfile(
      validProfile("openrouter/deepseek/deepseek-v4.1-flash", "openrouter/qwen/qwen3.6-flash", "low"),
      "Mixed Economic",
    )

    expect(profile.model).toBe("openrouter/deepseek/deepseek-v4.1-flash")
    expect(profile.agent.build?.model).toBe("openrouter/qwen/qwen3.6-flash")
    expect(profile.agent.build?.reasoningEffort).toBe("low")
  })

  test("rejects invalid profiles", () => {
    const invalid: Array<[string, string]> = [
      ["not json", "is not valid JSON"],
      ["null", "must be an object"],
      [JSON.stringify({ agent: {} }), "invalid default model"],
      [JSON.stringify({ model: "CONFIGURE_MODEL", agent: {} }), "invalid default model"],
      [JSON.stringify({ model: "openai gpt-6", agent: {} }), "invalid default model"],
      [JSON.stringify({ model: "openai/", agent: {} }), "invalid default model"],
      [JSON.stringify({ model: "openai/gpt-6" }), "no agent mapping"],
      [
        JSON.stringify({ model: "openai/gpt-6", agent: { build: {} } }),
        "invalid model for build",
      ],
      [
        JSON.stringify({ model: "openai/gpt-6", agent: { build: { model: "CONFIGURE_AGENT" } } }),
        "invalid model for build",
      ],
      [
        JSON.stringify({
          model: "openai/gpt-6",
          agent: { build: { model: "openai/gpt-6", reasoningEffort: " " } },
        }),
        "invalid reasoning effort for build",
      ],
    ]

    for (const [text, message] of invalid) {
      expect(() => parseProfile(text, "Broken")).toThrow(message)
    }
  })
})

describe("profile discovery", () => {
  test("ignores entries that are not .json files", async () => {
    const configured = await makeDirectory()

    await writeProfile(configured, "alpha", validProfile("openai/gpt-6"))
    await writeFile(join(configured, "notes.md"), "not a profile", "utf8")
    await mkdir(join(configured, "nested.json"))
    await writeFile(join(configured, "nested.json", "beta.json"), validProfile("openai/gpt-6"), "utf8")

    const store = await createProfileStore({
      directory: await makeDirectory(),
      profilesDir: configured,
    })

    expect(store.source).toBe("configured")
    expect(store.profiles).toEqual([{ name: "alpha", label: "Alpha" }])
    expect(store.has("notes")).toBe(false)
    expect(store.has("nested")).toBe(false)
  })

  test("resolves a relative profilesDir against the workspace directory", async () => {
    const workspace = await makeDirectory()
    await writeProfile(join(workspace, "profiles"), "local", validProfile("openai/gpt-6"))

    const store = await createProfileStore({ directory: workspace, profilesDir: "profiles" })

    expect(store.source).toBe("configured")
    expect(store.directory).toBe(join(workspace, "profiles"))
    expect(store.profiles.map((profile) => profile.name)).toEqual(["local"])
  })

  test("fails when the configured directory has no profiles", async () => {
    const workspace = await makeDirectory()

    await expect(
      createProfileStore({ directory: workspace, profilesDir: "missing" }),
    ).rejects.toThrow(/does not exist or contains no .json profiles/)
  })

  test("prefers the global profiles directory over the bundled examples", async () => {
    const xdg = await makeDirectory()
    process.env.XDG_CONFIG_HOME = xdg

    const global = join(xdg, "opencode", "profiles")
    await writeProfile(global, "team-wide", validProfile("openai/gpt-6"))

    const store = await createProfileStore({ directory: await makeDirectory() })

    expect(globalProfilesDirectory()).toBe(global)
    expect(store.source).toBe("global")
    expect(store.directory).toBe(global)
    expect(store.profiles.map((profile) => profile.name)).toEqual(["team-wide"])
  })

  test("ignores a global profile directory without .json files", async () => {
    const xdg = await makeDirectory()
    process.env.XDG_CONFIG_HOME = xdg

    await mkdir(join(xdg, "opencode", "profiles"), { recursive: true })
    await writeFile(join(xdg, "opencode", "profiles", "notes.md"), "not a profile", "utf8")

    const store = await createProfileStore({ directory: await makeDirectory() })

    expect(store.source).toBe("bundled")
  })

  test("falls back to the bundled examples and loads every one of them", async () => {
    process.env.XDG_CONFIG_HOME = await makeDirectory()

    const store = await createProfileStore({ directory: await makeDirectory() })

    expect(store.source).toBe("bundled")
    expect(store.directory).toBe(bundledProfilesDirectory())
    expect(store.profiles.map((profile) => profile.name)).toEqual([
      "claude-economic",
      "claude-performance",
      "gpt-economic",
      "gpt-performance",
      "mixed-economic",
      "mixed-performance",
    ])

    for (const profile of store.profiles) {
      const loaded = await store.load(profile.name)
      expect(loaded.model.length).toBeGreaterThan(0)
      expect(Object.keys(loaded.agent).length).toBeGreaterThan(0)
    }
  })
})

describe("selection state", () => {
  test("persists and reads the selection per directory", async () => {
    const first = await makeDirectory()
    const second = await makeDirectory()

    expect(await readSelectedProfile(first)).toBeUndefined()

    await persistSelectedProfile(first, "gpt-economic")

    expect(await readSelectedProfile(first)).toBe("gpt-economic")
    expect(await readSelectedProfile(second)).toBeUndefined()
    expect(profileStatePath(first)).toBe(join(first, ".opencode", "model-profile.json"))
    expect(
      JSON.parse(await readFile(profileStatePath(first), "utf8")),
    ).toEqual({ profile: "gpt-economic" })

    await persistSelectedProfile(second, "claude-performance")

    expect(await readSelectedProfile(first)).toBe("gpt-economic")
    expect(await readSelectedProfile(second)).toBe("claude-performance")
  })

  test("creates missing state directories and ignores corrupt state", async () => {
    const directory = await makeDirectory()

    await persistSelectedProfile(join(directory, "nested"), "mixed-economic")
    expect(await readSelectedProfile(join(directory, "nested"))).toBe("mixed-economic")

    const broken = await makeDirectory()
    await mkdir(join(broken, ".opencode"), { recursive: true })
    await writeFile(join(broken, ".opencode", "model-profile.json"), "{", "utf8")

    expect(await readSelectedProfile(broken)).toBeUndefined()
  })
})

describe("chooseInitialProfile", () => {
  const profiles = [
    { name: "gpt-economic", label: "GPT Economic" },
    { name: "gpt-performance", label: "GPT Performance" },
  ]

  test("prefers a valid persisted selection, then the configured default, then the first profile", () => {
    expect(
      chooseInitialProfile({ persisted: "gpt-performance", fallback: "gpt-economic", profiles }),
    ).toBe("gpt-performance")

    expect(chooseInitialProfile({ persisted: "missing", fallback: "gpt-performance", profiles })).toBe(
      "gpt-performance",
    )

    expect(chooseInitialProfile({ persisted: "missing", fallback: "missing", profiles })).toBe(
      "gpt-economic",
    )

    expect(chooseInitialProfile({ profiles: [] })).toBeUndefined()
  })

  test("builds labels from file names", () => {
    expect(profileLabel("gpt-economic")).toBe("GPT Economic")
    expect(profileLabel("mixed-performance")).toBe("Mixed Performance")
    expect(profileLabel("glm-team_plan")).toBe("GLM Team Plan")
  })
})

test("uses the home config directory when XDG_CONFIG_HOME is unset", () => {
  delete process.env.XDG_CONFIG_HOME
  expect(globalProfilesDirectory()).toBe(join(homedir(), ".config", "opencode", "profiles"))
})
