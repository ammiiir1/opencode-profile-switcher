import { randomUUID } from "node:crypto"
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"

export type ProfileName = string
export type AgentProfile = { model: string; reasoningEffort?: string }
export type Profile = { model: string; agent: Record<string, AgentProfile> }

const bundledProfilesDirectory = new URL("../examples/profiles/", import.meta.url)
const jsonExtension = /\.json$/i

type ProfileEntry = { name: string; file: string }

const profileEntries = async (directory: URL): Promise<ProfileEntry[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  return entries
    .filter(
      (entry) =>
        (entry.isFile() || entry.isSymbolicLink()) &&
        jsonExtension.test(entry.name),
    )
    .map((entry) => ({ name: entry.name.slice(0, -5), file: entry.name }))
    .filter((entry) => entry.name.length > 0)
    .sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    )
}

export const userProfilesDirectory = () =>
  pathToFileURL(
    `${join(
      process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config"),
      "opencode",
      "profiles",
    )}/`,
  )

export const resolveProfilesDirectory = async (): Promise<URL> => {
  const user = userProfilesDirectory()

  try {
    await mkdir(user, { recursive: true })
    if ((await profileEntries(user)).length > 0) {
      return user
    }
  } catch {}

  return bundledProfilesDirectory
}

const profilesDirectory = await resolveProfilesDirectory()
const profileFiles = new Map<ProfileName, string>()

export const discoverProfiles = async (directory: URL = profilesDirectory) => {
  const entries = await profileEntries(directory)

  if (directory.href === profilesDirectory.href) {
    profileFiles.clear()
    for (const entry of entries) profileFiles.set(entry.name, entry.file)
  }

  return Object.fromEntries(entries.map((entry) => [entry.name, entry.name.split("-").map((part) =>
    ["gpt", "glm"].includes(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)
  ).join(" ")]))
}

export const profileLabels: Record<ProfileName, string> = await discoverProfiles()

const profilePath = (name: ProfileName) =>
  new URL(`${encodeURIComponent(profileFiles.get(name) ?? `${name}.json`)}`, profilesDirectory)

export const profileStatePath = (directory: string) =>
  join(directory, ".opencode", "model-profile.json")

export const isProfileName = (value: unknown): value is ProfileName =>
  typeof value === "string" && Object.hasOwn(profileLabels, value)

export const loadProfile = async (name: ProfileName): Promise<Profile> => {
  if (!isProfileName(name)) throw new Error(`Unknown profile: ${name}`)
  const text = await readFile(profilePath(name), "utf8")
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`Profile ${profileLabels[name]} is not valid JSON`)
  }

  if (!value || typeof value !== "object") {
    throw new Error(`Profile ${profileLabels[name]} must be an object`)
  }
  const profile = value as Partial<Profile>
  if (typeof profile.model !== "string" || profile.model.trim() === "") {
    throw new Error(`Profile ${profileLabels[name]} has an invalid default model`)
  }
  if (!profile.agent || typeof profile.agent !== "object") {
    throw new Error(`Profile ${profileLabels[name]} has no agent mapping`)
  }
  for (const [agent, assignment] of Object.entries(profile.agent)) {
    if (!agent || !assignment || typeof assignment !== "object") {
      throw new Error(`Profile ${profileLabels[name]} has an invalid model for ${agent || "an agent"}`)
    }
    if (typeof assignment.model !== "string" || assignment.model.trim() === "") {
      throw new Error(`Profile ${profileLabels[name]} has an invalid model for ${agent}`)
    }
    if (
      assignment.reasoningEffort !== undefined &&
      (typeof assignment.reasoningEffort !== "string" || assignment.reasoningEffort.trim() === "")
    ) {
      throw new Error(`Profile ${profileLabels[name]} has an invalid reasoning effort for ${agent}`)
    }
  }
  return { model: profile.model, agent: { ...profile.agent } }
}

export const readSelectedProfile = async (directory: string): Promise<ProfileName | undefined> => {
  try {
    const value = JSON.parse(await readFile(profileStatePath(directory), "utf8")) as { profile?: unknown }
    return isProfileName(value?.profile) ? value.profile : undefined
  } catch {
    return undefined
  }
}

const pendingWrites = new Map<string, Promise<void>>()

const writeSelectedProfile = async (path: string, profile: ProfileName) => {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporary, `${JSON.stringify({ profile }, null, 2)}\n`, "utf8")
  await rename(temporary, path)
}

export const persistSelectedProfile = async (directory: string, profile: ProfileName) => {
  const path = profileStatePath(directory)
  const previous = pendingWrites.get(path) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(() => writeSelectedProfile(path, profile))

  pendingWrites.set(path, next)

  try {
    await next
  } finally {
    if (pendingWrites.get(path) === next) pendingWrites.delete(path)
  }
}
