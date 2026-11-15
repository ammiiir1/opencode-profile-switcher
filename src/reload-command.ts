import { existsSync } from "node:fs"
import { join } from "node:path"

export type ReloadCommand = {
  command: string
  args: string[]
  windowsVerbatimArguments?: boolean
}

const windowsLaunchers = ["opencode.exe", "opencode.cmd"]

const windowsPathEntries = (env: Record<string, string | undefined>): string[] => {
  const value = env.PATH ?? env.Path
  if (value === undefined) return []

  return value
    .split(";")
    .map((entry) => entry.trim().replace(/^"(.*)"$/, "$1"))
    .filter((entry) => entry.length > 0)
}

const findWindowsLauncher = (env: Record<string, string | undefined>): string | undefined => {
  const directories = windowsPathEntries(env)

  for (const launcher of windowsLaunchers) {
    for (const directory of directories) {
      const candidate = join(directory, launcher)
      if (existsSync(candidate)) return candidate
    }
  }

  return undefined
}

export const reloadCommand = (
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
): ReloadCommand | undefined => {
  if (platform !== "win32") {
    return { command: "opencode", args: ["reload"] }
  }

  const launcher = findWindowsLauncher(env)
  if (launcher === undefined) return undefined

  if (launcher.toLowerCase().endsWith(".exe")) {
    return { command: launcher, args: ["reload"] }
  }

  return {
    command: env.ComSpec ?? env.COMSPEC ?? "cmd.exe",
    args: ["/d", "/s", "/c", `""${launcher}" reload"`],
    windowsVerbatimArguments: true,
  }
}
