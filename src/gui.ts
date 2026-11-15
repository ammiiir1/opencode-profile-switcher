import { Command, Plugin } from "@opencode/plugin/gui"
import { ProfileRpc } from "./rpc"

type Selection = {
  profile: string
  label: string
  model: {
    providerID: string
    modelID: string
    variant?: string
  }
  skipped: string[]
}

export default Plugin.define({
  i18n: {
    en: {
      title: "Select model profile",
      group: "Plugin",
      "toast.switched":
        "Model and agent settings applied. Reasoning effort depends on model and provider support.",
      "toast.effort":
        "The model was applied, but the requested reasoning effort is unavailable for it.",
      "toast.skipped": "Agents not installed here were skipped: {{agents}}.",
      "toast.no-session":
        "Open a session first: profiles are stored per workspace directory.",
      "toast.no-composer":
        "Profile saved, but no active composer is available to select the model.",
      "toast.no-model": "Profile saved, but the composer could not select its model.",
      "toast.failed": "Model profile switch failed",
    },
  },

  setup(ctx) {
    ctx.add(Command, () => ({
      id: "open",
      title: ctx.t("title"),
      group: ctx.t("group"),
      slash: { name: "profile" },

      run: async () => {
        const directory = ctx.sessions.current()?.directory

        if (!directory) {
          ctx.toast.show({
            variant: "error",
            title: ctx.t("toast.no-session"),
          })
          return
        }

        try {
          const rpc = ctx.client.rpc(ProfileRpc)

          const listed = (await rpc.list({ directory })) as {
            profiles: Array<{
              name: string
              label: string
            }>
            current?: string
          }

          const selected = await ctx.dialogs.select<string>({
            title: ctx.t("title"),
            options: listed.profiles.map((profile) => ({
              title: profile.label,
              value: profile.name,
            })),
            current: listed.current,
          })

          if (!selected) return

          const chosen = (await rpc.select({ directory, profile: selected })) as Selection

          const composer = ctx.screen.current()?.composer

          if (!composer) {
            ctx.toast.show({
              variant: "error",
              title: ctx.t("toast.no-composer"),
            })
            return
          }

          const { providerID, modelID, variant } = chosen.model

          let effortApplied = true
          let applied = composer.setModel(
            variant === undefined ? { providerID, modelID } : { providerID, modelID, variant },
          )

          if (!applied && variant !== undefined) {
            applied = composer.setModel({ providerID, modelID })
            effortApplied = false
          }

          if (!applied) {
            ctx.toast.show({
              variant: "error",
              title: ctx.t("toast.no-model"),
            })
            return
          }

          ctx.toast.show({
            variant: effortApplied ? "success" : "default",
            title: `Switched to ${chosen.label}.`,
            description: ctx.t(effortApplied ? "toast.switched" : "toast.effort"),
          })

          if (chosen.skipped.length > 0) {
            ctx.toast.show({
              variant: "default",
              title: ctx.t("toast.skipped", { agents: chosen.skipped.join(", ") }),
            })
          }
        } catch (error) {
          ctx.toast.show({
            variant: "error",
            title: error instanceof Error ? error.message : ctx.t("toast.failed"),
          })
        }
      },
    }))
  },
})
