import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export type ProfileName = string
export type AgentProfile = { model: string; reasoningEffort?: string }
export type Profile = { model: string; agent: Record<string, AgentProfile> }
export type ProfileSummary = { name: ProfileName; label: string }
export type ProfileSource = "configured" | "global" | "bundled"

// `provider/model`, where the model part may itself contain slashes (e.g. `openrouter/deepseek/deepseek-v4.1-flash`).
const modelPattern = /^[^\s/]+(?:\/[^\s/]+)+$/

const acronyms = new Set(["gpt", "glm"])

export const profileLabel = (name: ProfileName): string =>
  name
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) =>
      acronyms.has(part.toLowerCase())
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ")

export const globalProfilesDirectory = (): string => {
  const xdg = process.env.XDG_CONFIG_HOME?.trim()
  return xdg && xdg.length > 0
    ? join(xdg, "opencode", "profiles")
    : join(homedir(), ".config", "opencode", "profiles")
}

export const bundledProfilesDirectory = (): string =>
  fileURLToPath(new URL("../examples/profiles/", import.meta.url))

export const readProfileNames = async (directory: string): Promise<ProfileName[]> => {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -".json".length))
    .filter((name) => name.length > 0)
    .sort()
}

export const parseProfile = (text: string, label: ProfileName): Profile => {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`Profile ${label} is not valid JSON`)
  }

  if (!value || typeof value !== "object") {
    throw new Error(`Profile ${label} must be an object`)
  }

  const profile = value as Partial<Profile>

  if (
    typeof profile.model !== "string" ||
    !modelPattern.test(profile.model) ||
    profile.model.includes("CONFIGURE_")
  ) {
    throw new Error(`Profile ${label} has an invalid default model`)
  }

  if (!profile.agent || typeof profile.agent !== "object") {
    throw new Error(`Profile ${label} has no agent mapping`)
  }

  for (const [agent, assignment] of Object.entries(profile.agent)) {
    if (
      !agent ||
      !assignment ||
      typeof assignment !== "object" ||
      typeof assignment.model !== "string" ||
      !modelPattern.test(assignment.model) ||
      assignment.model.includes("CONFIGURE_")
    ) {
      throw new Error(`Profile ${label} has an invalid model for ${agent || "an agent"}`)
    }

    if (
      assignment.reasoningEffort !== undefined &&
      (typeof assignment.reasoningEffort !== "string" ||
        assignment.reasoningEffort.trim() === "")
    ) {
      throw new Error(`Profile ${label} has an invalid reasoning effort for ${agent}`)
    }
  }

  return { model: profile.model, agent: { ...profile.agent } }
}

export const profileStatePath = (directory: string): string =>
  join(directory, ".opencode", "model-profile.json")

export const readSelectedProfile = async (directory: string): Promise<ProfileName | undefined> => {
  try {
    const value: unknown = JSON.parse(await readFile(profileStatePath(directory), "utf8"))
    const profile = (value as { profile?: unknown } | null)?.profile
    return typeof profile === "string" && profile.trim().length > 0 ? profile : undefined
  } catch {
    return undefined
  }
}

export const persistSelectedProfile = async (
  directory: string,
  profile: ProfileName,
): Promise<void> => {
  const path = profileStatePath(directory)
  const temporary = `${path}.tmp-${process.pid}`
  await mkdir(join(directory, ".opencode"), { recursive: true })
  await writeFile(temporary, `${JSON.stringify({ profile }, null, 2)}\n`, "utf8")
  await rename(temporary, path)
}

export type ProfileStore = {
  readonly directory: string
  readonly source: ProfileSource
  readonly profiles: readonly ProfileSummary[]
  has(name: ProfileName): boolean
  label(name: ProfileName): string
  load(name: ProfileName): Promise<Profile>
}

export const createProfileStore = async (options: {
  directory: string
  profilesDir?: string
}): Promise<ProfileStore> => {
  const configured = options.profilesDir
  let source: ProfileSource
  let directory: string
  let names: ProfileName[]

  if (configured !== undefined) {
    directory = resolve(options.directory, configured)
    names = await readProfileNames(directory)
    if (names.length === 0) {
      throw new Error(
        `Configured profile directory ${directory} does not exist or contains no .json profiles`,
      )
    }
    source = "configured"
  } else {
    const global = globalProfilesDirectory()
    const globalNames = await readProfileNames(global)

    if (globalNames.length > 0) {
      directory = global
      names = globalNames
      source = "global"
    } else {
      directory = bundledProfilesDirectory()
      names = await readProfileNames(directory)
      if (names.length === 0) {
        throw new Error(`Bundled profile examples are missing from ${directory}`)
      }
      source = "bundled"
    }
  }

  const labels = new Map<ProfileName, string>(
    names.map((name) => [name, profileLabel(name)]),
  )

  const label = (name: ProfileName): string => labels.get(name) ?? profileLabel(name)

  return {
    directory,
    source,
    profiles: names.map((name) => ({ name, label: label(name) })),
    has: (name) => labels.has(name),
    label,
    load: async (name) => {
      if (!labels.has(name)) throw new Error(`Unknown profile: ${name}`)
      return parseProfile(await readFile(join(directory, `${name}.json`), "utf8"), label(name))
    },
  }
}

export const chooseInitialProfile = (input: {
  persisted?: ProfileName | undefined
  fallback?: string | undefined
  profiles: readonly ProfileSummary[]
}): ProfileName | undefined => {
  const available = new Set(input.profiles.map((profile) => profile.name))
  if (input.persisted && available.has(input.persisted)) return input.persisted
  if (input.fallback && available.has(input.fallback)) return input.fallback
  return input.profiles[0]?.name
}
