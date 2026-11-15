import { Plugin } from "@opencode/plugin/tui"
import { ProfileRpc } from "./rpc"

type Selection = {
  label: string
  skipped: string[]
}

const chooseProfile = async (context: Plugin.Context) => {
  const location = context.location ?? context.data.location.default()

  const directory = location.directory

  try {
    const rpc = context.client.rpc(ProfileRpc)

    const listed = (await rpc.list({ directory })) as {
      profiles: Array<{
        name: string
        label: string
      }>
      current?: string
    }

    const selected = await context.ui.dialog.select<string>({
      title: "Select model profile",
      current: listed.current,
      options: listed.profiles.map((profile) => ({
        title: profile.label,
        value: profile.name,
      })),
    })

    if (!selected || selected === listed.current) return

    const chosen = (await rpc.select({
      directory,
      profile: selected,
    })) as Selection

    context.ui.toast.show({
      variant: "success",
      message: `Switched to ${chosen.label}. Reasoning effort is applied only when the model and provider support it.`,
    })

    if (chosen.skipped.length > 0) {
      context.ui.toast.show({
        variant: "warning",
        message: `Agents not installed here were skipped: ${chosen.skipped.join(", ")}.`,
      })
    }
  } catch (error) {
    context.ui.toast.show({
      variant: "error",
      message: error instanceof Error ? error.message : "Model profile switch failed",
    })
  }
}

export const ModelProfile = Plugin.define({
  id: "profile",

  setup(context) {
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "profile.open",
          title: "Select model profile",
          group: "Plugin",
          palette: true,
          slash: { name: "profile" },
          run: () => void chooseProfile(context),
        },
      ],
    }))
  },
})

export default ModelProfile
