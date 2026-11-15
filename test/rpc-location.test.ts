import { describe, expect, test } from "bun:test"
import type { Plugin } from "@opencode/plugin/tui"
import { createRoot } from "solid-js"
import GuiPlugin from "../src/gui"
import TuiPlugin from "../src/tui"

const directory = "/workspace/repo"

type RpcRecord = {
  method: "list" | "select"
  input: unknown
  options: unknown
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const rpcClient = (records: RpcRecord[]) => () => ({
  list: async (input: unknown, options: unknown) => {
    records.push({ method: "list", input, options })
    return { profiles: [{ name: "chosen", label: "Chosen" }] }
  },
  select: async (input: unknown, options: unknown) => {
    records.push({ method: "select", input, options })
    return { profile: "chosen", label: "Chosen" }
  },
})

describe("profile RPC location", () => {
  test("TUI commands target the workspace location", async () => {
    const records: RpcRecord[] = []
    let layer!: () => { commands: Array<{ run: () => void }> }

    const context = {
      location: { directory },
      client: { rpc: rpcClient(records) },
      ui: {
        dialog: { select: async () => "chosen" },
        router: { current: () => ({ type: "session", sessionID: "ses_test" }) },
        toast: { show: () => {} },
      },
      keymap: {
        layer: (factory: typeof layer) => {
          layer = factory
        },
      },
    }

    TuiPlugin.setup(context as unknown as Plugin.Context)
    layer().commands[0]!.run()
    await flush()

    expect(records).toEqual([
      {
        method: "list",
        input: { directory },
        options: { location: { directory } },
      },
      {
        method: "select",
        input: { directory, profile: "chosen", sessionID: "ses_test" },
        options: { location: { directory } },
      },
    ])
  })

  test("GUI command targets the session location", async () => {
    const records: RpcRecord[] = []
    let factory!: () => { run: () => void | Promise<void> }

    const context = {
      id: "profile",
      t: (key: string) => key,
      add: (_type: unknown, create: typeof factory) => {
        factory = create
      },
      sessions: {
        current: () => ({
          key: "sidecar\nses_test",
          id: "ses_test",
          directory,
          server: { data: { session: { get: () => undefined } } },
        }),
      },
      client: { rpc: rpcClient(records) },
      dialogs: { select: async () => "chosen" },
      screen: {
        current: () => ({
          composer: {
            setModel: () => true,
            model: () => undefined,
            setVariant: () => true,
          },
        }),
      },
      toast: { show: () => {} },
    }

    const dispose = createRoot((dispose) => {
      GuiPlugin.setup?.(context as never)
      return dispose
    })

    await factory().run()

    expect(records).toEqual([
      {
        method: "list",
        input: { directory },
        options: { location: { directory } },
      },
      {
        method: "select",
        input: { directory, profile: "chosen", sessionID: "ses_test" },
        options: { location: { directory } },
      },
    ])

    dispose()
  })
})
