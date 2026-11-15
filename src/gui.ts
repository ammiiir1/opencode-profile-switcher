import { Command, Plugin } from "@opencode/plugin/gui";
import { createEffect, untrack } from "solid-js";
import { ProfileRpc } from "./rpc";

type DurableModel = {
  id: string;
  providerID: string;
  variant?: string;
};

const durableModelKey = (model: DurableModel) =>
  `${model.providerID}/${model.id}/${model.variant ?? "default"}`;

type ProfileSelection = {
  profile: string;
  label: string;
  model: {
    providerID: string;
    modelID: string;
    variant?: string;
  };
};

export default Plugin.define({
  i18n: {
    en: {
      title: "Select model profile",
      group: "Plugin",
      "toast.switched": "Profile and Desktop composer updated.",
      "toast.partial":
        "Profile saved, but the Desktop composer could not select the model.",
      "toast.variant":
        "Profile and model updated, but the requested reasoning effort is unavailable.",
      "toast.failed": "Model profile switch failed",
      "toast.no-session":
        "Open a session first: profiles are stored per workspace directory.",
      "toast.no-composer":
        "Profile saved, but no active Desktop composer is available.",
    },
  },

  setup(ctx) {
    const observedModels = new Map<string, string>();

    createEffect(() => {
      const session = ctx.sessions.current();
      const composer = ctx.screen.current()?.composer;

      if (!session || !composer) return;

      const durable = session.server.data.session.get(session.id)?.model;

      if (!durable) return;

      const key = durableModelKey(durable);
      const seen = observedModels.get(session.key);

      observedModels.set(session.key, key);

      if (seen === undefined || seen === key) return;

      const current = untrack(() => composer.model());

      if (
        current?.providerID === durable.providerID &&
        current?.modelID === durable.id &&
        current?.variant === durable.variant
      ) {
        return;
      }

      const target = {
        providerID: durable.providerID,
        modelID: durable.id,
        ...(durable.variant ? { variant: durable.variant } : {}),
      };

      const applied =
        composer.setModel(target) ||
        (target.variant !== undefined &&
          composer.setModel({
            providerID: target.providerID,
            modelID: target.modelID,
          }));

      if (!applied) return;

      if (untrack(() => composer.model())?.variant !== target.variant) {
        composer.setVariant(target.variant);
      }
    });

    ctx.add(
      Command,
      (): Command => ({
        id: "open",
        title: ctx.t("title"),
        group: ctx.t("group"),
        slash: { name: "profile" },

        run: async () => {
          const directory = ctx.sessions.current()?.directory;

          if (!directory) {
            ctx.toast.show({
              variant: "error",
              title: ctx.t("toast.no-session"),
            });
            return;
          }

          try {
            const rpc = ctx.client.rpc(ProfileRpc);

            const listed = (await rpc.list(
              { directory },
              { location: { directory } },
            )) as {
              profiles: Array<{
                name: string;
                label: string;
              }>;
              current?: string;
            };

            const selected = await ctx.dialogs.select<string>({
              title: ctx.t("title"),
              options: listed.profiles.map((profile) => ({
                title: profile.label,
                value: profile.name,
              })),
              current: listed.current,
            });

            if (!selected) return;

            const chosen = (await rpc.select(
              {
                directory,
                profile: selected,
                sessionID: ctx.sessions.current()?.id,
              },
              { location: { directory } },
            )) as ProfileSelection;

            const composer = ctx.screen.current()?.composer;

            if (!composer) {
              ctx.toast.show({
                variant: "error",
                title: ctx.t("toast.no-composer"),
              });
              return;
            }

            const applied = composer.setModel({
              providerID: chosen.model.providerID,
              modelID: chosen.model.modelID,
            });

            if (!applied) {
              ctx.toast.show({
                variant: "error",
                title: ctx.t("toast.partial"),
              });
              return;
            }

            const requested = chosen.model.variant;
            const before = composer.model()?.variant;

            const variantApplied = composer.setVariant(requested);

            const after = composer.model()?.variant;

            ctx.toast.show({
              variant: variantApplied ? "success" : "error",
              title: variantApplied ? "Variant accepted" : "Variant rejected",
              description: [
                `Requested: ${requested ?? "undefined"}`,
                `Before: ${before ?? "undefined"}`,
                `After: ${after ?? "undefined"}`,
              ].join(" | "),
            });

            if (!variantApplied) {
              ctx.toast.show({
                variant: "error",
                title: ctx.t("toast.variant"),
              });
              return;
            }

            ctx.toast.show({
              variant: "success",
              title: `Switched to ${chosen.label}.`,
              description: ctx.t("toast.switched"),
            });
          } catch (error) {
            ctx.toast.show({
              variant: "error",
              title:
                error instanceof Error ? error.message : ctx.t("toast.failed"),
            });
          }
        },
      }),
    );
  },
});
