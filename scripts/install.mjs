#!/usr/bin/env node
import { access, cp, mkdir, readFile, rename, rm } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// The npm package is scoped, but OpenCode needs one flat plugin directory.
const packageName = "@ammiiir1/opencode-profile-switcher"
const installDirectory = "opencode-profile-switcher"
const requiredProfiles = [
  "claude-economic",
  "claude-performance",
  "gpt-economic",
  "gpt-performance",
  "mixed-economic",
  "mixed-performance",
]
const skippedEntries = new Set([
  "node_modules",
  ".git",
  ".opencode",
  ".DS_Store",
  "test",
  "bun.lock",
  "tsconfig.json",
  "vite.config.ts",
])

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))

const usage = `Usage: node scripts/install.mjs [options]

Installs ${packageName} into OpenCode's global plugins directory, as the flat
directory ${installDirectory}/, where OpenCode discovers it automatically.
No build step is required.

Options:
  --from <dir>     Package directory to install (default: ${repositoryRoot})
  --target <dir>   Plugins directory to install into
                   (default: $XDG_CONFIG_HOME/opencode/plugins or ~/.config/opencode/plugins)
  --force          Replace an existing installation
  --remove         Remove a previously installed copy
  --dry-run        Print what would happen without touching the filesystem
  -h, --help       Show this help

A leading ~ or ~\\ in --from or --target expands to your home directory.
`

const fail = (message) => {
  console.error(`error: ${message}`)
  process.exit(1)
}

const info = (message) => {
  console.log(message)
}

const warn = (message) => {
  console.warn(`warning: ${message}`)
}

const expandHome = (path) =>
  path === "~"
    ? homedir()
    : path.startsWith("~/") || path.startsWith("~\\")
      ? join(homedir(), path.slice(2))
      : path

const parseArguments = (argv) => {
  const options = { from: repositoryRoot, target: undefined, force: false, remove: false, dryRun: false }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    switch (argument) {
      case "--from": {
        const value = argv[index + 1]
        if (value === undefined) fail("--from requires a directory")
        options.from = value
        index += 1
        break
      }
      case "--target": {
        const value = argv[index + 1]
        if (value === undefined) fail("--target requires a directory")
        options.target = value
        index += 1
        break
      }
      case "--force":
        options.force = true
        break
      case "--remove":
        options.remove = true
        break
      case "--dry-run":
        options.dryRun = true
        break
      case "-h":
      case "--help":
        console.log(usage)
        process.exit(0)
        break
      default:
        fail(`unknown argument: ${argument}\n\n${usage}`)
    }
  }

  return options
}

const configDirectory = () => {
  const xdg = process.env.XDG_CONFIG_HOME?.trim()
  return xdg && xdg.length > 0 ? join(xdg, "opencode") : join(homedir(), ".config", "opencode")
}

const pluginsDirectory = (target) =>
  target === undefined ? join(configDirectory(), "plugins") : resolve(expandHome(target))

const profilesDirectory = () => join(configDirectory(), "profiles")

const installPath = (plugins) => join(plugins, installDirectory)

const readManifest = async (path) => {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch {
    return undefined
  }
}

const requireEntry = async (path) => {
  try {
    await access(path)
  } catch {
    fail(`missing ${path}; install from a packaged release or run the build first`)
  }
}

const pathExists = async (path) => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const validateSource = async (from) => {
  const source = resolve(expandHome(from))
  const manifest = await readManifest(join(source, "package.json"))

  if (manifest === undefined) fail(`${source} does not contain a package.json`)
  if (manifest.name !== packageName) {
    fail(`${source} is not ${packageName} (found ${String(manifest.name)})`)
  }

  await requireEntry(join(source, "dist", "gui-experimental.cjs"))
  await requireEntry(join(source, "src", "index.ts"))
  await requireEntry(join(source, "src", "tui.tsx"))

  for (const profile of requiredProfiles) {
    await requireEntry(join(source, "examples", "profiles", `${profile}.json`))
  }

  return { source, version: String(manifest.version) }
}

const copyFilter = (path) => {
  const name = path.split(/[\\/]/).pop()
  return name === undefined || !skippedEntries.has(name)
}

const warnAboutDuplicateRegistration = async (plugins) => {
  const directory = dirname(plugins)

  for (const name of ["opencode.json", "opencode.jsonc"]) {
    let text
    try {
      text = await readFile(join(directory, name), "utf8")
    } catch {
      continue
    }

    if (text.includes(packageName) || text.includes(installDirectory)) {
      warn(
        `${join(directory, name)} already references this plugin (${packageName}). Do not install the plugin twice: keep either that entry or the auto-discovered copy, not both. This script never edits OpenCode configuration.`,
      )
    }
  }
}

const printNextSteps = (destination, plugins, profiles) => {
  info("")
  info("Next steps")
  info("  1. Restart OpenCode (or reload its server) so it discovers the plugin.")
  info("  2. Open a repository and run /profile in the TUI or the Desktop GUI.")
  if (profiles === undefined) {
    info(`  3. Could not create ${profilesDirectory()}. Create it yourself; new .json files are discovered after \`opencode reload\`.`)
  } else {
    info(`  3. ${profiles} is ready and stays empty until you add profiles. Put your own .json files there; new files are discovered after \`opencode reload\`.`)
    info(`     The six bundled examples live only inside the installed package and are used read-only while ${profiles} has no .json profile. Installing or updating never overwrites or deletes profile files.`)
  }
  info(`  Remove this copy with: node scripts/install.mjs --remove --target "${plugins}"`)
  info("")
  info(`Installed at ${destination}`)
}

const install = async (options) => {
  const { source, version } = await validateSource(options.from)
  const plugins = pluginsDirectory(options.target)
  const destination = installPath(plugins)
  const existing = await readManifest(join(destination, "package.json"))

  if (existing !== undefined) {
    if (existing.name !== packageName) {
      fail(`refusing to replace ${destination}: its package.json is not ${packageName}`)
    }

    if (existing.version !== version) {
      warn(`replacing ${packageName} ${String(existing.version)} with ${version}`)
    }

    if (!options.force) {
      fail(`${destination} already exists; re-run with --force to replace it`)
    }
  }

  await warnAboutDuplicateRegistration(plugins)

  if (options.dryRun) {
    info(`Would copy ${source} (${version}) to ${destination}`)
    info(`Would create ${profilesDirectory()} if it is missing, without adding any profiles`)
    return
  }

  const staging = `${destination}.installing-${process.pid}`
  const backup = `${destination}.backup-${process.pid}`
  const hadDestination = await pathExists(destination)

  await rm(staging, { recursive: true, force: true })
  await mkdir(plugins, { recursive: true })
  await cp(source, staging, { recursive: true, filter: copyFilter })

  let backedUp = false

  try {
    if (hadDestination) {
      await rm(backup, { recursive: true, force: true })
      await rename(destination, backup)
      backedUp = true
    }

    await rename(staging, destination)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (backedUp) {
      try {
        await rm(destination, { recursive: true, force: true })
        await rename(backup, destination)
        backedUp = false
      } catch (restoreError) {
        warn(
          `could not restore the previous installation from ${backup}: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`,
        )
      }
    }

    await rm(staging, { recursive: true, force: true })
    fail(`could not install into ${destination}: ${message}`)
  }

  if (backedUp) await rm(backup, { recursive: true, force: true })

  const profiles = profilesDirectory()
  let profilesReady = false

  try {
    await mkdir(profiles, { recursive: true })
    profilesReady = true
  } catch (error) {
    warn(
      `could not create ${profiles}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  printNextSteps(destination, plugins, profilesReady ? profiles : undefined)
}

const remove = async (options) => {
  const plugins = pluginsDirectory(options.target)
  const destination = installPath(plugins)
  const existing = await readManifest(join(destination, "package.json"))

  if (existing === undefined) {
    info(`Nothing to remove: ${destination} is not installed`)
    return
  }

  if (existing.name !== packageName) {
    fail(`refusing to remove ${destination}: its package.json is not ${packageName}`)
  }

  if (options.dryRun) {
    info(`Would remove ${destination}`)
    return
  }

  await rm(destination, { recursive: true, force: true })
  info(`Removed ${destination}`)
  info("Your profile JSON files and per-repository .opencode/model-profile.json selections were kept.")
}

const main = async () => {
  const major = Number(process.versions.node.split(".")[0])

  if (!Number.isFinite(major) || major < 20) {
    fail(`Node.js 20 or newer is required (found ${process.versions.node})`)
  }

  const options = parseArguments(process.argv.slice(2))

  if (options.remove) {
    await remove(options)
    return
  }

  await install(options)
}

await main()
