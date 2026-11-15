import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { reloadCommand } from "../src/reload-command"

const created: string[] = []

const makeDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "profile-reload-"))
  created.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("reload command selection", () => {
  test("keeps the direct spawn command on macOS and Linux", () => {
    expect(reloadCommand("darwin", {})).toEqual({ command: "opencode", args: ["reload"] })
    expect(reloadCommand("linux", {})).toEqual({ command: "opencode", args: ["reload"] })
  })

  test("prefers an .exe launcher over a .cmd launcher on Windows", async () => {
    const first = await makeDirectory()
    const second = await makeDirectory()

    await writeFile(join(first, "opencode.cmd"), "", "utf8")
    await writeFile(join(second, "opencode.exe"), "", "utf8")

    expect(reloadCommand("win32", { PATH: `${first};${second}` })).toEqual({
      command: join(second, "opencode.exe"),
      args: ["reload"],
    })
  })

  test("runs a .cmd launcher through cmd.exe with quoting", async () => {
    const directory = await makeDirectory()
    const launcher = join(directory, "opencode.cmd")

    await writeFile(launcher, "", "utf8")

    expect(reloadCommand("win32", { Path: directory, ComSpec: "cmd.exe" })).toEqual({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", `""${launcher}" reload"`],
      windowsVerbatimArguments: true,
    })
  })

  test("returns undefined when no Windows launcher is found", async () => {
    const directory = await makeDirectory()

    expect(reloadCommand("win32", { PATH: directory })).toBeUndefined()
    expect(reloadCommand("win32", {})).toBeUndefined()
  })
})
