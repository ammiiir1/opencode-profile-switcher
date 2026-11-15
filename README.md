# OpenCode V2 Profile Switcher

Switch between model profiles in **OpenCode V2** without reconfiguring every agent by hand. A profile names a default model and, optionally, a model and reasoning effort for each agent. The selected profile is stored per repository and applied to the server's model and agent registries, with integrations for the **Terminal UI (TUI)** and the experimental **Desktop GUI**.

## Features

- Select a profile with `/profile` in the TUI or the Desktop GUI.
- Set a default model and per-agent model and reasoning effort from one JSON file.
- Apply settings to built-in agents and to custom agents that exist on your install.
- Store the selection **per repository** in `.opencode/model-profile.json`.
- Switch the open root session's model and schedule an OpenCode server reload after a profile selection.
- Ship server, TUI, Desktop GUI, and RPC integrations in one package.

## Reasoning effort is best-effort

A profile's `reasoningEffort` is applied as a model variant. That synchronization is **best-effort and depends on model and provider support**:

- A variant is registered only when the model is available to the plugin and accepts the requested variant.
- The server registry and the Desktop Composer keep separate state. The plugin selects the profile's model in the active Composer, but a manually chosen reasoning effort in the Composer is not guaranteed to be replaced.
- When an effort cannot be applied, the model is still applied. Toasts and docs say so instead of promising effort support.

## Requirements

- **OpenCode V2** with an installed plugin SDK compatible with `@opencode/plugin` 2.3.x. V1 is not supported.
- Provider connections and access to the model IDs your profiles reference.
- The Desktop application for GUI integration, the terminal application for TUI integration.
- **Installing never builds anything.** The GUI bundle is committed to the repository and published in the package, so npm, GitHub, and manual installs all work without Node.js, npm, Bun, Vite, or Homebrew. (The optional `scripts/install.mjs` helper needs Node.js 20+.)
- **Platforms:** macOS is tested and working. Linux compatibility has been reviewed, and Windows compatibility improvements are implemented, but neither has been tested on a real installation yet. See [Compatibility and status](#compatibility-and-status).

The Desktop GUI extension API is experimental and can change between OpenCode versions. Check release compatibility when updating OpenCode.

## Install — use one method only

The npm package is scoped: **`@ammiiir1/opencode-profile-switcher`**. The GitHub repository keeps its unscoped name, `ammiiir1/opencode-profile-switcher`. Both install paths below refer to the same plugin. These are the instructions for the first published release: the npm commands apply once that release is available, while the GitHub install reads the repository directly.

From npm:

```sh
opencode plugin add @ammiiir1/opencode-profile-switcher
```

Or straight from the GitHub repository:

```sh
opencode plugin add github:ammiiir1/opencode-profile-switcher
```

`opencode plugin add` registers the plugin with OpenCode; `npm install -g` does **not**. Both commands install the same plugin.

> **Install once.** The plugin must be registered exactly one way. Installing from npm *and* GitHub, or installing twice, registers the same server plugin and TUI/GUI entries twice, which produces duplicated or conflicting `/profile` entries. Remove the previous installation before switching methods.

### Version pinning

```sh
# npm, exact version
opencode plugin add @ammiiir1/opencode-profile-switcher@0.1.0

# GitHub, npm git-ref syntax (tag or commit)
opencode plugin add github:ammiiir1/opencode-profile-switcher#v0.1.0
```

### Check, update, remove

```sh
opencode plugin list
opencode plugin check
opencode plugin update @ammiiir1/opencode-profile-switcher
opencode plugin remove @ammiiir1/opencode-profile-switcher
```

Open or reload OpenCode, then type `/profile` in the TUI or the Desktop GUI. Desktop loads GUI extensions from its own server's plugin configuration; if you use an external server, confirm which server the application is connected to.

A clean install creates the global profiles directory `$XDG_CONFIG_HOME/opencode/profiles` (or `~/.config/opencode/profiles`) as an **empty** directory; it is never filled with the bundled examples. Until you add a `.json` profile there, `/profile` lists the six bundled examples, which stay inside the installed package and are read only.

## Manual installation

Use this when you do not want a package registry. No build step is required: the package ships its prebuilt GUI bundle.

1. Get a **built package**: a release archive from this repository, or a tarball produced by `npm pack @ammiiir1/opencode-profile-switcher`. A GitHub-generated *source code* archive also works, because `dist/gui-experimental.cjs` is committed.
2. Keep the package root intact — it must contain `package.json` (with its `exports`), `src/`, `dist/`, and `examples/`.
3. Place that directory in your OpenCode global plugins directory, as an immediate subdirectory named `opencode-profile-switcher` (flat, without the `@ammiiir1` scope nesting).
4. Restart or reload OpenCode and check `/profile` in the interfaces you use.

The plugin creates the global profiles directory on first run if it is missing, and leaves it empty. The bundled examples stay in the installed package's `examples/profiles/`; they are never copied into your profiles directory.

Default global plugin directories:

| Platform | Plugin package directory |
| --- | --- |
| macOS (tested) | `~/.config/opencode/plugins/opencode-profile-switcher/` |
| Linux | `$XDG_CONFIG_HOME/opencode/plugins/opencode-profile-switcher/` (or `~/.config/opencode/plugins/…`) |
| Windows (PowerShell) | `$HOME/.config/opencode/plugins/opencode-profile-switcher/` |

These are documented locations, not a claim of tested support: only macOS has been verified on a real installation so far. OpenCode also supports custom config locations; use the directory **your** OpenCode installation reads.

### Optional installer script

The repository includes a small Node.js installer that copies the built package into that directory for you. It requires Node.js 20 or newer, never edits OpenCode configuration, and does not build anything. It installs into the flat `opencode-profile-switcher` directory while validating the scoped package name `@ammiiir1/opencode-profile-switcher`.

```sh
# from a checkout or an extracted release archive
node scripts/install.mjs --dry-run
node scripts/install.mjs

# explicit locations
node scripts/install.mjs --from /path/to/opencode-profile-switcher --target ~/.config/opencode/plugins

# replace an existing copy, or remove it again
node scripts/install.mjs --force
node scripts/install.mjs --remove
```

| Flag | Purpose |
| --- | --- |
| `--from <dir>` | Package directory to install (default: this repository) |
| `--target <dir>` | Plugins directory to install into (default: `$XDG_CONFIG_HOME/opencode/plugins` or `~/.config/opencode/plugins`) |
| `--force` | Replace a copy that is already installed |
| `--remove` | Remove a copy previously installed by this script |
| `--dry-run` | Print the actions without touching the filesystem |

Before copying, the script validates the scoped package name, `dist/gui-experimental.cjs`, and the six bundled example profiles. It refuses to overwrite or remove a directory whose `package.json` belongs to another package, and it warns when `opencode.json`/`opencode.jsonc` already references the plugin so you do not register it twice.

After a successful copy the script creates the global profiles directory (`$XDG_CONFIG_HOME/opencode/profiles` or `~/.config/opencode/profiles`) when it is missing, and leaves it empty: the bundled examples are not copied into it. `--dry-run` reports that step without creating anything. The script never rewrites or deletes profile files you added, and `--remove` keeps the profiles directory and its contents.

The alternative to the plugins directory is an explicit path, which you must also remove when uninstalling:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-profile-switcher"]
}
```

Use forward slashes on Windows (`C:/Users/you/opencode-profile-switcher`) or escape backslashes. Keep other global configuration intact, and do not register both an auto-discovered directory and an explicit path.

### Why not Homebrew?

Homebrew was considered and deliberately not provided: it installs files, while OpenCode's own `opencode plugin add` already installs, updates, and removes a V2 plugin on macOS, Linux, and Windows. A formula or cask would duplicate that distribution path and add a second thing to keep in sync without giving users anything extra.

## Profiles

A profile is a JSON file:

```json
{
  "model": "openai/gpt-6.1-sol",
  "agent": {
    "build": {
      "model": "openai/gpt-6.1-terra",
      "reasoningEffort": "medium"
    },
    "plan": {
      "model": "openai/gpt-6.1-sol",
      "reasoningEffort": "medium"
    },
    "orchestrator": {
      "model": "openai/gpt-6.1-sol",
      "reasoningEffort": "high"
    }
  }
}
```

- `model` is the profile's fallback model, used when no agent-specific assignment matches.
- Each `agent` entry sets that agent's model and, optionally, its reasoning effort.
- A model reference is split at the **first** `/` into a provider and a model ID; everything after that `/` is passed to OpenCode unchanged, so `openrouter/deepseek/deepseek-v4.1-flash` means provider `openrouter` and model `deepseek/deepseek-v4.1-flash`.
- The plugin does not restrict provider names, model IDs, or the number of `/` separators. Whether a model exists and is usable is OpenCode's concern.
- `build` and `plan` are built-in primary agents; `general` and `explore` are built-in subagents. `orchestrator`, `coder`, `auditor`, and `vision-analyst` in the bundled examples are **illustrative custom agent names** — a profile does not create agents.
- Files must be `.json`; no `//` comments.

You write your own profiles: create a `.json` file in the global profiles directory (`$XDG_CONFIG_HOME/opencode/profiles` or `~/.config/opencode/profiles`) and run `opencode reload` so discovery picks it up.

### Where profiles are discovered

In order:

1. The global user directory `$XDG_CONFIG_HOME/opencode/profiles` (or `~/.config/opencode/profiles`; `%USERPROFILE%\.config\opencode\profiles` on Windows) — used when it contains at least one `.json` file.
2. The bundled `examples/profiles/` shipped with the package.

The global directory is created automatically, and empty, when it does not exist: plugin setup does it, and so does `scripts/install.mjs`. Creating it never writes, overwrites, or deletes profile files you have added. If it cannot be created — a read-only home directory, for example — setup logs a warning and uses the bundled examples instead of failing.

The bundled directory is a read-only fallback: discovery reads it and never writes to it. The six examples stay inside the package and are never copied into the global profiles directory.

Profiles added to the global directory are picked up on the next `opencode reload`, because plugin setup re-reads the directory. No reinstall is needed.

The bundled directory is required as the last fallback; if it is missing, setup fails with a clear message.

Profile names come from file names, sorted alphabetically; labels are derived from the name (`gpt-economic` → `GPT Economic`).

### Initial selection

Initial selection is resolved as: the stored per-repository selection, when one exists → the first profile in the global profiles directory, ordered alphabetically by file name. No profile name is hardcoded, and a bundled example is never selected automatically: while your global profiles directory has no `.json` profile, no profile is active until you choose one.

### Bundled example profiles

| File | Purpose |
| --- | --- |
| [`gpt-economic.json`](examples/profiles/gpt-economic.json) | OpenAI-focused, cost-conscious mix |
| [`gpt-performance.json`](examples/profiles/gpt-performance.json) | OpenAI-focused, higher-capability mix |
| [`claude-economic.json`](examples/profiles/claude-economic.json) | Anthropic-focused, cost-conscious mix |
| [`claude-performance.json`](examples/profiles/claude-performance.json) | Anthropic-focused, higher-capability mix |
| [`mixed-economic.json`](examples/profiles/mixed-economic.json) | Cross-provider, cost-conscious mix |
| [`mixed-performance.json`](examples/profiles/mixed-performance.json) | Cross-provider, higher-capability mix |

Names and model IDs are illustrative. Connect the required providers, and check that each model/effort setting exists for your OpenCode version and provider. **economic** and **performance** express priorities, not a guarantee about cost or benchmark results.

These six files exist only in the package's `examples/profiles/` directory. They are templates: each one shows the profile structure, a complete set of model and reasoning-effort assignments, and how custom agents are referenced. No install, update, reload, or first run copies them into your global profiles directory, and the plugin never writes to that bundled directory. While your global directory has no `.json` profile, `/profile` lists these examples, and none of them is selected automatically. To start from one, copy the file yourself into the global directory and adapt it; define the custom agents it names before selecting it.

### Custom agents

Referencing an agent in a profile does not create that agent: a profile only assigns a model and reasoning effort to agents your OpenCode installation already defines. The custom agent names in the examples — `orchestrator`, `coder`, `auditor`, `vision-analyst` — are illustrative, so define those agents before you select an example that names them. Selecting a profile that references an agent your installation does not define fails with `Unknown agent: <name>`, and the selection is neither saved nor applied. The built-in `build`, `plan`, `general`, and `explore` agents need no setup.

## Use `/profile`

1. Open a repository in the OpenCode TUI or Desktop GUI.
2. Type `/profile` and pick a profile.
3. The selection is saved to that repository's `.opencode/model-profile.json`.
4. The plugin switches the open root session's model and schedules an `opencode reload` to apply model and agent transforms.
5. In the Desktop GUI, the active Composer also selects the profile's model when a session is open.

Switch again at any time; selecting a profile is a runtime action.

TUI and Desktop GUI are separate plugin interfaces. `/profile` is registered in the TUI keymap's slash-command list and as a Desktop GUI command with an explicit slash entry; one does not register the other.

## Update or uninstall

```sh
opencode plugin check
opencode plugin update @ammiiir1/opencode-profile-switcher
opencode plugin remove @ammiiir1/opencode-profile-switcher
```

For manual installations, replace or remove the installed directory (or use `node scripts/install.mjs --remove`), then reload OpenCode. If you added an explicit `plugins` path, remove that entry too.

Updating, reinstalling, and uninstalling never overwrite, modify, or delete your profile JSON files or the per-repository `.opencode/model-profile.json` selections. The global profiles directory and anything you put in it stay in place; remove those yourself if you want them gone. Profiles you add while OpenCode is running appear after `opencode reload`.

## Build from source (contributors)

```sh
git clone https://github.com/ammiiir1/opencode-profile-switcher.git
cd opencode-profile-switcher
bun install
bun run typecheck
bun test
bun run build
```

`bun run build` writes `dist/gui-experimental.cjs` from `src/gui.ts` through the official experimental GUI Vite preset (`@opencode/plugin/gui/vite`). The bundle is committed and shipped so that npm and GitHub installs never need build tooling; `prepack` rebuilds it when you publish, and `bun run watch` rebuilds on change.

Package layout:

```text
package.json        exports: ".", "./tui", "./rpc", "./gui-experimental"
src/index.ts        server plugin: transforms, session pinning, per-repo state, RPC handlers
src/tui.tsx         TUI plugin: /profile slash command
src/gui.ts          experimental Desktop GUI plugin, bundled to CommonJS
src/rpc.ts          shared RPC contract
src/profile-shared.ts  discovery, validation, persistence
dist/               prebuilt GUI bundle
examples/profiles/  bundled profiles
scripts/install.mjs manual installer
test/               bun test suites (not published)
```

The GUI bundle is CommonJS and must not import a module with top-level `await`; the server-side storage module is therefore never imported there — the GUI calls the server through the RPC contract.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `/profile` is missing in the Desktop GUI | Confirm the plugin is registered once, the Desktop app uses that server, and the package contains `dist/gui-experimental.cjs`. Check Settings → Extensions → Plugins where available. |
| `/profile` is missing in the TUI | Confirm `./tui` is exported and the TUI slash command registered; check `opencode plugin list`. |
| `/profile` appears twice | Two installations are registered (for example npm plus GitHub, or a plugins directory plus an explicit `plugins` path). Keep one. |
| No profiles appear | A clean install shows the six bundled examples and leaves the global profiles directory empty until you add a profile. Check the setup error in the plugin log, confirm the JSON is valid, and confirm the model IDs exist. |
| A profile you just added is not listed | Discovery runs at plugin setup: run `opencode reload` (or restart OpenCode) after adding a `.json` file to the global profiles directory, then open `/profile`. |
| Your profiles are missing after an update or uninstall | They should not be: installing, updating, reloading, and `node scripts/install.mjs --remove` never touch the global profiles directory or per-repository selections. Confirm which config home your OpenCode reads: `$XDG_CONFIG_HOME/opencode/profiles` versus `~/.config/opencode/profiles`. |
| Your custom agent was not changed | The switch failed with `Unknown agent: <name>` because the profile references an agent your installation does not define; nothing was saved. Define the agent in OpenCode first. |
| The Desktop model looks unchanged | The server registry and the Desktop Composer keep separate state. The Composer selection needs an open session; reopen the session or pick the profile again. |
| Reasoning effort did not change | Variant synchronization is best-effort and provider/model dependent, and a manually selected Composer effort may stay. The profile's model is still applied. |
| A stale model after a profile switch | Check that the switch succeeded in a session of the same directory; selections are per repository. Reload the plugin from OpenCode's plugin settings if needed. |
| Build fails while installing | Installations need no build. If you are developing, run `bun install`, then `bun run build`; do not initialize a different package inside an installed plugin directory. |

## Compatibility and status

- **Target:** OpenCode V2 (`@opencode/plugin` 2.3.x). V1 is not supported.
- **Platform status:** macOS is tested and working. Linux compatibility has been reviewed, but the plugin has not been tested on a real Linux installation. Windows compatibility improvements are implemented, but the plugin has not been tested on a real Windows installation, so some issues may remain. Windows users: please report problems at [github.com/ammiiir1/opencode-profile-switcher/issues](https://github.com/ammiiir1/opencode-profile-switcher/issues).
- **Interfaces:** server, TUI, and experimental Desktop GUI, plus the RPC contract in `./rpc`.
- **Experimental limitation:** the Desktop GUI plugin SDK is not a stable API across releases.
- **Runtime:** OpenCode supplies the JavaScript runtime; the manual installer script needs Node.js 20 or newer.

## License

MIT. See [`LICENSE`](LICENSE) for the full text.

## OpenCode documentation

- [Plugin overview and package exports](https://opencode.ai/docs/build/plugins/)
- [Plugin installation and management](https://opencode.ai/docs/plugins)
- [TUI plugin SDK and slash commands](https://opencode.ai/docs/build/plugins/cli/)
- [Desktop GUI plugin SDK](https://opencode.ai/docs/build/plugins/gui/)
- [Configuration locations](https://opencode.ai/docs/config)
