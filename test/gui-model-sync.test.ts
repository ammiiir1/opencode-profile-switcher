import { describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import GuiPlugin from "../src/gui"

type DurableModel = {
  id: string
  providerID: string
  variant?: string
}

type ComposerModel = {
  providerID: string
  modelID: string
  variant?: string
}

type Call = {
  method: "setModel" | "setVariant"
  value: unknown
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const harness = (initial: {
  durable?: DurableModel
  composer: ComposerModel
}) => {
  const [durable, setDurable] = createSignal<DurableModel | undefined>(
    initial.durable,
  )
  const calls: Call[] = []
  let model: ComposerModel = { ...initial.composer }

  const composer = {
    model: () => model,
    setModel: (next: ComposerModel) => {
      calls.push({ method: "setModel", value: next })
      model = {
        providerID: next.providerID,
        modelID: next.modelID,
        variant: model.variant,
      }
      return true
    },
    setVariant: (variant: string | undefined) => {
      calls.push({ method: "setVariant", value: variant })
      model = { ...model, variant }
      return true
    },
  }

  const context = {
    id: "profile",
    t: (key: string) => key,
    add: () => {},
    sessions: {
      current: () => ({
        key: "sidecar\nses_test",
        id: "ses_test",
        server: { data: { session: { get: () => ({ model: durable() }) } } },
      }),
    },
    client: { rpc: () => ({}) },
    dialogs: { select: async () => undefined },
    screen: { current: () => ({ composer }) },
    toast: { show: () => {} },
  }

  const dispose = createRoot((dispose) => {
    GuiPlugin.setup?.(context as never)
    return dispose
  })

  return { calls, setDurable, dispose }
}

describe("desktop composer model sync", () => {
  test("the first observation keeps a stale composer model", async () => {
    const { calls, dispose } = harness({
      durable: { id: "durable", providerID: "anthropic", variant: "high" },
      composer: { providerID: "anthropic", modelID: "local", variant: "low" },
    })

    await flush()

    expect(calls).toEqual([])

    dispose()
  })

  test("a durable model change updates the composer", async () => {
    const { calls, setDurable, dispose } = harness({
      durable: { id: "old", providerID: "anthropic", variant: "low" },
      composer: { providerID: "anthropic", modelID: "old", variant: "low" },
    })

    setDurable({ id: "new", providerID: "openai", variant: "high" })
    await flush()

    expect(calls).toEqual([
      {
        method: "setModel",
        value: { providerID: "openai", modelID: "new", variant: "high" },
      },
      { method: "setVariant", value: "high" },
    ])

    dispose()
  })

  test("an unchanged durable model is applied once", async () => {
    const { calls, setDurable, dispose } = harness({
      durable: { id: "old", providerID: "anthropic", variant: "low" },
      composer: { providerID: "anthropic", modelID: "old", variant: "low" },
    })

    setDurable({ id: "new", providerID: "openai", variant: "high" })
    await flush()

    setDurable({ id: "new", providerID: "openai", variant: "high" })
    await flush()

    expect(calls).toHaveLength(2)

    dispose()
  })

  test("an already matching composer is left alone", async () => {
    const { calls, setDurable, dispose } = harness({
      durable: { id: "old", providerID: "anthropic" },
      composer: { providerID: "openai", modelID: "new" },
    })

    await flush()

    setDurable({ id: "new", providerID: "openai" })
    await flush()

    expect(calls).toEqual([])

    dispose()
  })
})
