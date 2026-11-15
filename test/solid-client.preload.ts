import { mock } from "bun:test"
import { createRequire } from "node:module"
import * as solid from "solid-js"

const require = createRequire(import.meta.url)
const client = require("solid-js/dist/solid.cjs")

mock.module("solid-js", () => ({ ...solid, ...client }))
