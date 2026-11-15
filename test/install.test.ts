import { afterEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
const installer = join(repositoryRoot, "scripts", "install.mjs")
const exampleNames = [
  "claude-economic",
  "claude-performance",
  "gpt-economic",
  "gpt-performance",
  "mixed-economic",
  "mixed-performance",
]
const validProfile = JSON.stringify({
  model: "openai/gpt-6",
  agent: { build: { model: "openai/gpt-6", reasoningEffort: "medium" } },
})

const created: string[] = []
const originalXdg = process.env.XDG_CONFIG_HOME

const makeConfigRoot = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "profile-install-"))
  created.push(directory)
  return directory
}

const runInstaller = (configRoot: string, args: string[]) => {
  const result = spawnSync(process.execPath, [installer, "--from", repositoryRoot, ...args], {
    env: { ...process.env, XDG_CONFIG_HOME: configRoot },
    encoding: "utf8",
  })

  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
}

const layout = (configRoot: string) => {
  const opencode = join(configRoot, "opencode")

  return {
    opencode,
    profiles: join(opencode, "profiles"),
    installed: join(opencode, "plugins", "opencode-profile-switcher"),
  }
}

afterEach(async () => {
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = originalXdg

  await Promise.all(
    created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe("installer script", () => {
  test("installs the package and creates an empty global profiles directory", async () => {
    const configRoot = await makeConfigRoot()
    const { profiles, installed } = layout(configRoot)

    const result = runInstaller(configRoot, [])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(profiles)
    expect(existsSync(join(installed, "package.json"))).toBe(true)
    expect(await readdir(profiles)).toEqual([])
    expect((await readdir(join(installed, "examples", "profiles"))).sort()).toEqual(
      exampleNames.map((name) => `${name}.json`),
    )
  })

  test("dry run touches nothing", async () => {
    const configRoot = await makeConfigRoot()
    const { opencode } = layout(configRoot)

    const result = runInstaller(configRoot, ["--dry-run"])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Would create")
    expect(existsSync(opencode)).toBe(false)
  })

  test("keeps existing user profiles unchanged when forcing a reinstall", async () => {
    const configRoot = await makeConfigRoot()
    const { profiles } = layout(configRoot)
    const mine = join(profiles, "mine.json")

    expect(runInstaller(configRoot, []).status).toBe(0)

    await writeFile(mine, validProfile, "utf8")

    const result = runInstaller(configRoot, ["--force"])

    expect(result.status).toBe(0)
    expect(await readFile(mine, "utf8")).toBe(validProfile)
    expect(await readdir(profiles)).toEqual(["mine.json"])
  })

  test("removes the plugin but keeps the profiles directory", async () => {
    const configRoot = await makeConfigRoot()
    const { profiles, installed } = layout(configRoot)
    const mine = join(profiles, "mine.json")

    expect(runInstaller(configRoot, []).status).toBe(0)

    await writeFile(mine, validProfile, "utf8")

    const result = runInstaller(configRoot, ["--remove"])

    expect(result.status).toBe(0)
    expect(existsSync(installed)).toBe(false)
    expect(await readFile(mine, "utf8")).toBe(validProfile)
    expect(await readdir(profiles)).toEqual(["mine.json"])
  })
})
