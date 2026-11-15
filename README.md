# OpenCode Profile Switcher

Switch between model profiles in **OpenCode V2** without manually reconfiguring every agent. A profile can specify a default model and model/reasoning settings for built-in and custom agents. Profile selection is stored per repository, with integrations for both the **Terminal UI (TUI)** and **Desktop GUI**.

> **Pre-release documentation** — This README describes the intended public package and installation workflow. The source is being moved into a standalone package; **the commands below that install from npm/GitHub work only after the package or repository has been published with its required built artifacts**. The GUI API is experimental. Confirm all platforms and installation paths against a clean release before removing this notice.

## Features

- Select model profiles using `/profile` in the TUI or Desktop GUI.
- Configure a default model and separate model/reasoning settings per agent.
- Support both built-in agents and existing custom agents.
- Persist the selected profile **per repository** in `.opencode/model-profile.json`.
- Apply profile changes to the server's agent configuration; update the active Desktop Composer model when supported.
- Use JSON profiles you can copy, edit, and share.
- Ship server, TUI, and Desktop GUI integrations in one OpenCode V2 plugin package.

> **Known limitation:** The active Desktop Composer's manually selected reasoning effort is not guaranteed to reset to the profile's effort setting. Model selection and agent-registry settings are distinct from Composer UI state.

## Requirements

- An installed and working **OpenCode V2** version compatible with this plugin's release. The exact minimum tested version will be stated in the first release notes.
- Provider connections and access to the model IDs referenced in your profiles.
- The Desktop application for GUI integration; the terminal application for TUI integration.
- **No Node.js, npm, Bun, Vite, or Homebrew is required for end users** when installing a published, prebuilt package through OpenCode's native plugin installer.

OpenCode's experimental GUI extension interface can change between OpenCode versions; check release compatibility when updating OpenCode.

## Install — recommended (macOS, Windows, Linux)

Open a terminal (Terminal on macOS/Linux or PowerShell/Windows). When this plugin is published to npm:

```sh
opencode plugin add opencode-profile-switcher
```

Alternatively, after the GitHub repository contains a correctly packaged, distributable plugin:

```sh
opencode plugin add github:YOUR_GITHUB_USERNAME/opencode-profile-switcher
```

**Replace `YOUR_GITHUB_USERNAME` with the actual repository owner before publishing this README.** These are alternative install methods: use **one**, not both. `opencode plugin add` installs a supported package and adds it to the global OpenCode configuration. It is not the same as `npm install -g`, which does not register the plugin with OpenCode.

Check installation:

```sh
opencode plugin list
```

Open or reload OpenCode, then type `/profile` in the TUI or Desktop GUI. The command should appear in the slash-command suggestions and open the profile picker. Desktop loads GUI extensions from its own server's global plugin configuration; if you use an external server, confirm which server the application is connected to.

### About Homebrew and click-to-install

Homebrew **is not required**. OpenCode's own `plugin add` is the primary cross-platform installation method. A Homebrew formula/cask or click-to-install package should only be advertised if an actual separately maintained release artifact exists; none is assumed by this README.

## Manual installation — no npm or Homebrew

Use this when you do not want to install the plugin from a package registry. You still need OpenCode itself.

1. Download a **built release archive** from this repository's Releases page (once published). It must contain the package root (`package.json` with its `exports`), `src/`, and the prebuilt `dist/gui-experimental.cjs`. A GitHub-generated *source code* archive without `dist/` may **not** be usable as-is.
2. Extract the package directory, keeping the internal folder structure intact.
3. Place that directory into your OpenCode global plugin directory, as an immediate subdirectory named `opencode-profile-switcher`.
4. Open/reload OpenCode and check the `/profile` command in both available interfaces.

Default global plugin directories:

| Platform | Plugin package directory |
| --- | --- |
| macOS | `~/.config/opencode/plugins/opencode-profile-switcher/` |
| Linux | `~/.config/opencode/plugins/opencode-profile-switcher/` |
| Windows (PowerShell) | `$HOME/.config/opencode/plugins/opencode-profile-switcher/` |

OpenCode also supports custom config locations (including XDG paths); use the directory that **your OpenCode installation** actually reads. You can instead keep the built package in any directory and add that directory path under `plugins` in your global `opencode.jsonc`, for example:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-profile-switcher"]
}
```

For a Windows absolute path in JSON, use forward slashes, such as `C:/Users/you/Downloads/opencode-profile-switcher`, or escape backslashes. Preserve other existing global configuration settings when adding a plugin. Do not register both the auto-discovered folder and an explicit duplicate path.

> **Manual-install caveat:** A release archive must include everything necessary to load the package. The exact manual install layout will be checked with a clean OpenCode V2 setup before the first release.

## Set up your first profile

Profile files are JSON. The existing plugin implementation discovers global profiles from:

```text
~/.config/opencode/profiles/*.json
```

On Windows, the equivalent is normally under the user's home directory (for example `$HOME/.config/opencode/profiles/`). If the final packaged version changes profile discovery or supports a configurable profile directory, update this section to reflect the implemented behavior.

Copy one or more files from [`examples/profiles/`](examples/profiles/) into the profile directory. Or create a new file, such as `my-profile.json`:

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
    },
    "coder": {
      "model": "openai/gpt-6.1-terra",
      "reasoningEffort": "medium"
    }
  }
}
```

Here `build` and `plan` are built-in primary agents, while `orchestrator` and `coder` are **illustrative custom agent names**. The example assumes that `orchestrator` is configured as a primary agent and `coder` as a subagent **in their agent definitions**. A profile does not create agents or determine their types.

The built-in agent names used in the included examples are:

| Agent | Type |
| --- | --- |
| `build`, `plan` | Built-in primary agents |
| `general`, `explore` | Built-in subagents |
| `orchestrator` | Example custom primary agent |
| `coder`, `auditor`, `vision-analyst` | Example custom subagents |

Names and model IDs in the examples are illustrative. You must connect the required providers, and every model/effort setting must be supported by your OpenCode version and provider. The labels **economic** and **performance** express different priorities, not a guarantee about actual cost or benchmark results.

> **JSON only:** Profile files are `.json`; do not insert `//` comments. Put explanatory comments in documentation, not in the profile file.

## Included profile examples

| File | Purpose |
| --- | --- |
| [`gpt-economic.json`](examples/profiles/gpt-economic.json) | OpenAI-focused, cost-conscious mix |
| [`gpt-performance.json`](examples/profiles/gpt-performance.json) | OpenAI-focused, higher-capability mix |
| [`claude-economic.json`](examples/profiles/claude-economic.json) | Anthropic-focused, cost-conscious mix |
| [`claude-performance.json`](examples/profiles/claude-performance.json) | Anthropic-focused, higher-capability mix |
| [`mixed-economic.json`](examples/profiles/mixed-economic.json) | Cross-provider, cost-conscious mix |
| [`mixed-performance.json`](examples/profiles/mixed-performance.json) | Cross-provider, higher-capability mix |

The example files are optional. Custom agents referenced in them must already exist in the user's OpenCode configuration.

## Use `/profile`

1. Open your repository in the OpenCode TUI or Desktop GUI.
2. Type `/profile` and select a profile from the list.
3. The selected profile is saved in that repository's `.opencode/model-profile.json`.
4. The plugin updates the relevant server configuration and, where supported, the current Desktop Composer model without a full OpenCode application restart.
5. Switch again at any time; selecting a profile is a runtime action and does **not** require rebuilding the plugin.

**Desktop:** `/profile` must be registered as a GUI command with an explicit slash entry, not merely as a command-palette entry. **TUI:** it must be registered in the TUI keymap's slash-command list. These are separate plugin interfaces; one does not automatically register the other.

## Update or uninstall

For a package installed with `opencode plugin add`:

```sh
opencode plugin check
opencode plugin update opencode-profile-switcher
opencode plugin remove opencode-profile-switcher
```

For manual installations, replace or remove the manually installed plugin directory, then reload OpenCode. When using an explicit `plugins` path, remove that entry as well.

Uninstalling the plugin should **not** silently delete your profile JSON files or per-repository `.opencode/model-profile.json` selections. Remove those separately only if you choose to.

## Build from source (contributors)

The public release ships a compiled GUI bundle; the steps here are for maintainers or contributors, **not** normal installation.

Prerequisites: Git, Bun, and an OpenCode V2 SDK-compatible toolchain.

```sh
git clone https://github.com/YOUR_GITHUB_USERNAME/opencode-profile-switcher.git
cd opencode-profile-switcher
bun install
bunx vite build
```

The build configuration should use the official experimental GUI Vite preset and produce `dist/gui-experimental.cjs` from `src/gui.ts` (or its final chosen source entry). `package.json` must export that bundle as `./gui-experimental` alongside the server and TUI entries. For example, the relevant exports are:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./tui": "./src/tui.tsx",
    "./gui-experimental": "./dist/gui-experimental.cjs",
    "./rpc": "./src/rpc.ts"
  }
}
```

**Do not copy this partial manifest over the actual `package.json`.** The real package also needs its name, version, dependencies, build scripts, and package files. The GUI output is a single prebuilt CommonJS bundle; updating `src/gui.ts` alone does not rebuild it.

Before making a release, check that the published artifact includes the built GUI bundle and that a clean installation exposes `/profile` in **both** the TUI and Desktop GUI on the targeted OpenCode version.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `/profile` is missing in Desktop | Confirm the plugin is in global `opencode.json(c)`, the Desktop app is using that server, and `./gui-experimental` exists in the package exports and built files. Check Settings > Extensions > Plugins where supported. |
| `/profile` is missing in the TUI | Confirm `./tui` is exported and the TUI slash-command registration is present; check `opencode plugin list`. |
| Profiles do not appear | Ensure the profile files are valid `.json` files in the directory expected by your installed version; ensure the provider/model IDs are valid. |
| A custom agent is missing | Define the custom agent separately in OpenCode; referencing a name in a profile does not create that agent. |
| Desktop model appears unchanged | The server registry and Desktop Composer keep separate state. Reload the plugin/GUI, check the active session, and confirm the installed bundle is current. |
| Agent model settings do not update | Verify the active repository selection and corresponding agent registry. A config reload may be required. |
| Reasoning effort remains at a manually selected value | This is a known limitation of Desktop Composer synchronization; the profile's model assignment is not a guarantee of Composer effort reset. |
| Build fails with `INVALID_TLA_FORMAT` | Avoid importing a top-level-await module such as `profile-shared.ts` into the CommonJS GUI bundle. Pass selected data over the server RPC contract instead. |
| Build fails to resolve GUI/Vite packages | Install the repository's declared build dependencies; do not initialize a new unrelated package inside the installed plugin directory. |

## Compatibility and status

- **Target:** OpenCode V2; V1 compatibility is not claimed.
- **Platforms:** macOS, Windows, and Linux are intended targets; release-level compatibility must be verified individually.
- **Interfaces:** Server, TUI, and experimental Desktop GUI.
- **Experimental limitation:** The GUI plugin SDK is not a stable API across all releases.
- **First public release:** Not yet published or independently verified from the source provided for this README.

## License

MIT. See [`LICENSE`](LICENSE) for the full license text.

## OpenCode documentation

- [Plugin overview and package exports](https://opencode.ai/docs/build/plugins/)
- [Plugin installation and management](https://opencode.ai/docs/plugins)
- [TUI plugin SDK and slash commands](https://opencode.ai/docs/build/plugins/cli/)
- [Desktop GUI plugin SDK](https://opencode.ai/docs/build/plugins/gui/)
- [Configuration locations](https://opencode.ai/docs/config)
