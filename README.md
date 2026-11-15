# OpenCode Profile Switcher

Switch between model profiles in **OpenCode V2** without reconfiguring every agent by hand. A profile names a default model and, optionally, a model and reasoning effort for each agent. The selected profile is stored per repository and applied to the server's model and agent registries, with integrations for the **Terminal UI (TUI)** and the experimental **Desktop GUI**.

## Features

- Select a profile with `/profile` in the TUI or the Desktop GUI.
- Set a default model and per-agent model and reasoning effort from one JSON file.
- Apply settings to built-in agents and to custom agents that exist on your install.
- Store the selection **per repository** in `.opencode/model-profile.json`.
- Refresh the live model and agent registries in-process after a switch, without restarting OpenCode.
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

The Desktop GUI extension API is experimental and can change between OpenCode versions. Check release compatibility when updating OpenCode.

## Install — use one method only

```sh
opencode plugin add opencode-profile-switcher
```

Or install straight from GitHub:

```sh
opencode plugin add github:ammiiir1/opencode-profile-switcher
```

`opencode plugin add` registers the plugin with OpenCode; `npm install -g` does **not**. Both commands install the same plugin.

> **Install once.** The plugin must be registered exactly one way. Installing from npm *and* GitHub, or installing twice, registers the same server plugin and TUI/GUI entries twice, which produces duplicated or conflicting `/profile` entries. Remove the previous installation before switching methods.

### Version pinning

```sh
# npm, exact version
opencode plugin add opencode-profile-switcher@0.1.0

# GitHub, npm git-ref syntax (tag or commit)
opencode plugin add github:ammiiir1/opencode-profile-switcher#v0.1.0
```

### Check, update, remove

```sh
opencode plugin list
opencode plugin check
opencode plugin update opencode-profile-switcher
opencode plugin remove opencode-profile-switcher
```

Open or reload OpenCode, then type `/profile` in the TUI or the Desktop GUI. Desktop loads GUI extensions from its own server's plugin configuration; if you use an external server, confirm which server the application is connected to.

## Manual installation

Use this when you do not want a package registry. No build step is required: the package ships its prebuilt GUI bundle.

1. Get a **built package**: a release archive from this repository, or a tarball produced by `npm pack opencode-profile-switcher`. A GitHub-generated *source code* archive also works, because `dist/gui-experimental.cjs` is committed.
2. Keep the package root intact — it must contain `package.json` (with its `exports`), `src/`, `dist/`, and `examples/`.
3. Place that directory in your OpenCode global plugins directory, as an immediate subdirectory named `opencode-profile-switcher`.
4. Restart or reload OpenCode and check `/profile` in the interfaces you use.

Default global plugin directories:

| Platform | Plugin package directory |
| --- | --- |
| macOS | `~/.config/opencode/plugins/opencode-profile-switcher/` |
| Linux | `$XDG_CONFIG_HOME/opencode/plugins/opencode-profile-switcher/` (or `~/.config/opencode/plugins/…`) |
| Windows (PowerShell) | `$HOME/.config/opencode/plugins/opencode-profile-switcher/` |

OpenCode also supports custom config locations; use the directory **your** OpenCode installation reads.

### Optional installer script

The repository includes a small cross-platform installer that copies the built package into that directory for you. It requires Node.js 20 or newer, never edits OpenCode configuration, and does not build anything.

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

Before copying, the script validates the package name, `dist/gui-experimental.cjs`, and the six bundled example profiles. It refuses to overwrite or remove a directory whose `package.json` belongs to another package, and it warns when `opencode.json`/`opencode.jsonc` already references the plugin so you do not register it twice.

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
- Model references are `provider/model`; the model part may contain slashes, for example `openrouter/deepseek/deepseek-v4.1-flash`.
- `build` and `plan` are built-in primary agents; `general` and `explore` are built-in subagents. `orchestrator`, `coder`, `auditor`, and `vision-analyst` in the bundled examples are **illustrative custom agent names** — a profile does not create agents.
- Files must be `.json`; no `//` comments.

### Where profiles are discovered

In order:

1. `options.profilesDir`, when you set it. A relative path resolves against the workspace directory.
2. The global user directory `$XDG_CONFIG_HOME/opencode/profiles` (or `~/.config/opencode/profiles`) — used when it contains at least one `.json` file.
3. The bundled `examples/profiles/` shipped with the package.

A configured `profilesDir` that is missing or contains no `.json` profiles is a setup error, named in the plugin log, rather than a silent fallback. The bundled directory is required as the last fallback; if it is missing, setup fails with a clear message.

Profile names come from file names, sorted alphabetically; labels are derived from the name (`gpt-economic` → `GPT Economic`).

### Options

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-profile-switcher",
      "options": {
        "profilesDir": "./profiles",
        "defaultProfile": "gpt-economic"
      }
    }
  ]
}
```

| Option | Purpose |
| --- | --- |
| `profilesDir` | Directory to read profiles from. Relative paths resolve against the workspace directory. |
| `defaultProfile` | Profile used when the repository has no stored selection yet. |

Initial selection is resolved as: stored per-repository selection (when it still exists) → `defaultProfile` → first discovered profile. No profile name is hardcoded, so a clean install works without the examples matching your personal setup.

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

### Custom agents

Agent assignments are applied only to agents that exist on your install. Agents a profile names but your OpenCode does not define are skipped instead of rejecting the profile, and the skipped names are reported in a toast. That is why the bundled examples work on a clean install while custom agent names remain optional.

## Use `/profile`

1. Open a repository in the OpenCode TUI or Desktop GUI.
2. Type `/profile` and pick a profile.
3. The selection is saved to that repository's `.opencode/model-profile.json`.
4. The plugin disposes and re-registers its model and agent transforms, so the live registries follow the new profile without restarting OpenCode.
5. In the Desktop GUI, the active Composer also selects the profile's model when a session is open.

Switch again at any time; selecting a profile is a runtime action.

TUI and Desktop GUI are separate plugin interfaces. `/profile` is registered in the TUI keymap's slash-command list and as a Desktop GUI command with an explicit slash entry; one does not register the other.

## Update or uninstall

```sh
opencode plugin check
opencode plugin update opencode-profile-switcher
opencode plugin remove opencode-profile-switcher
```

For manual installations, replace or remove the installed directory (or use `node scripts/install.mjs --remove`), then reload OpenCode. If you added an explicit `plugins` path, remove that entry too.

Updating or uninstalling never deletes your profile JSON files or the per-repository `.opencode/model-profile.json` selections. Remove those yourself if you want them gone.

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
| No profiles appear | Check the setup error in the plugin log: a configured `profilesDir` that is missing or has no `.json` files fails setup by design. Also confirm the JSON is valid and the model IDs exist. |
| Your custom agent was not changed | The profile was applied and the agent was skipped — the toast lists it. Define the agent in OpenCode first. |
| The Desktop model looks unchanged | The server registry and the Desktop Composer keep separate state. The Composer selection needs an open session; reopen the session or pick the profile again. |
| Reasoning effort did not change | Variant synchronization is best-effort and provider/model dependent, and a manually selected Composer effort may stay. The profile's model is still applied. |
| A stale model after a profile switch | Check that the switch succeeded in a session of the same directory; selections are per repository. Reload the plugin from OpenCode's plugin settings if needed. |
| Build fails while installing | Installations need no build. If you are developing, run `bun install`, then `bun run build`; do not initialize a different package inside an installed plugin directory. |

## Compatibility and status

- **Target:** OpenCode V2 (`@opencode/plugin` 2.3.x). V1 is not supported.
- **Platforms:** macOS, Linux, and Windows.
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
