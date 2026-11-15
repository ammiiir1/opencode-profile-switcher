import { Rpc } from "@opencode/plugin/rpc"

export const ProfileRpc = Rpc.define({
  id: "profile",
  methods: {
    list: {
      input: {
        type: "object",
        properties: {
          directory: { type: "string" },
        },
        required: ["directory"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          profiles: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                label: { type: "string" },
              },
              required: ["name", "label"],
              additionalProperties: false,
            },
          },
          current: { type: "string" },
        },
        required: ["profiles"],
        additionalProperties: false,
      },
    },
    select: {
      input: {
        type: "object",
        properties: {
          directory: { type: "string" },
          profile: { type: "string" },
        },
        required: ["directory", "profile"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          profile: { type: "string" },
          label: { type: "string" },
          model: {
            type: "object",
            properties: {
              providerID: { type: "string" },
              modelID: { type: "string" },
              variant: { type: "string" },
            },
            required: ["providerID", "modelID"],
            additionalProperties: false,
          },
          skipped: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["profile", "label", "model", "skipped"],
        additionalProperties: false,
      },
      errors: {
        invalid: {
          type: "object",
          properties: {
            profile: { type: "string" },
          },
          required: ["profile"],
          additionalProperties: false,
        },
      },
    },
  },
  events: {},
})

export default ProfileRpc
