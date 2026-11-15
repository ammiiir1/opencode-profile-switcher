import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

type ProfileShared = typeof import("../src/profile-shared")

const validProfile = JSON.stringify({
  model: "openai/gpt-6",
  agent: { build: { model: "openai/gpt-6", reasoningEffort: "medium" } },
})
const roots: string[] = []
const originalXdg = process.env.XDG_CONFIG_HOME

const makeRoot = async (prefix: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  roots.push(directory)
  return directory
}

const makeUserProfiles = async (root: string): Promise<string> => {
  const directory = join(root, "opencode", "profiles")
  await mkdir(directory, { recursive: true })
  return directory
}

const probeRoot = await makeRoot("profile-symlink-probe-")
const probeTarget = join(probeRoot, "target.json")
await writeFile(probeTarget, validProfile, "utf8")

let symlinksSupported = true
try {
  await symlink(probeTarget, join(probeRoot, "link.json"))
} catch {
  symlinksSupported = false
}

let shared: ProfileShared

beforeAll(async () => {
  const root = await makeRoot("profile-shared-")
  await writeFile(join(await makeUserProfiles(root), "upper.JSON"), validProfile, "utf8")
  process.env.XDG_CONFIG_HOME = root
  shared = await import("../src/profile-shared")
})

afterAll(async () => {
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = originalXdg

  await Promise.all(roots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("profile discovery", () => {
  test("uses an uppercase .json extension in the default profiles directory", async () => {
    expect(Object.keys(shared.profileLabels)).toEqual(["upper"])
    expect(shared.profileLabels.upper).toBe("Upper")
    expect((await shared.loadProfile("upper")).model).toBe("openai/gpt-6")
  })

  test("discovers .json extensions case-insensitively and keeps the file name", async () => {
    const directory = await makeRoot("profile-extensions-")

    await writeFile(join(directory, "alpha.JSON"), validProfile, "utf8")
    await writeFile(join(directory, "beta.Json"), validProfile, "utf8")
    await writeFile(join(directory, "gamma.json"), validProfile, "utf8")

    expect(await shared.discoverProfiles(pathToFileURL(directory))).toEqual({
      alpha: "Alpha",
      beta: "Beta",
      gamma: "Gamma",
    })
  })

  test.skipIf(!symlinksSupported)("treats symlinked profiles as candidates", async () => {
    const directory = await makeRoot("profile-symlinks-")
    const targetRoot = await makeRoot("profile-symlink-target-")
    const target = join(targetRoot, "linked.json")

    await writeFile(target, validProfile, "utf8")
    await symlink(target, join(directory, "linked.json"))

    expect(await shared.discoverProfiles(pathToFileURL(directory))).toEqual({
      linked: "Linked",
    })
  })
})

describe("profile persistence", () => {
  test("serializes concurrent selections and leaves no temporary files", async () => {
    const directory = await makeRoot("profile-state-")
    const names = ["alpha", "beta", "gamma", "delta"]

    await Promise.all(names.map((name) => shared.persistSelectedProfile(directory, name)))

    const stateDirectory = join(directory, ".opencode")
    expect(await readdir(stateDirectory)).toEqual(["model-profile.json"])

    const state = JSON.parse(await readFile(join(stateDirectory, "model-profile.json"), "utf8"))
    expect(state).toEqual({ profile: "delta" })
  })
})
