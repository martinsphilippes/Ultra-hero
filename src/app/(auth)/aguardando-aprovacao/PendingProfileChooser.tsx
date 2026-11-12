"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { Button } from "@/components/ui";
import type { ChoosableProfile } from "@/lib/access/status";
import { chooseProfileAction, type PendingActionState } from "./actions";

const INITIAL: PendingActionState = { status: "idle" };

// "Como você vai usar o Ultra?" para quem entrou com Google/Apple sem escolher o perfil. Hero no navegador: a action
// devolve a mensagem do aplicativo (o cadastro de Hero é só no app).
export function PendingProfileChooser({ profiles, current }: { profiles: readonly ChoosableProfile[]; current: ChoosableProfile | null }) {
  const t = useTranslations("access");
  const [state, action, pending] = useActionState(chooseProfileAction, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-3" data-testid="pending-profile-chooser">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-fg">{t("pending.chooseTitle")}</legend>
        <p className="mb-1 type-body-sm text-fg-muted">{t("pending.chooseText")}</p>
        {profiles.map((p) => (
          <label key={p} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-bg px-4 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
            <input type="radio" name="profile" value={p} defaultChecked={p === current} className="size-4 accent-[var(--color-accent)]" required />
            <span className="text-sm font-medium text-fg">{t(`profiles.${p}`)}</span>
          </label>
        ))}
      </fieldset>
      {state.status === "error" ? (
        <AuthAlert tone={state.error === "creatorAppOnly" ? "info" : "error"}>
          <span data-testid="pending-choose-error">{t(`pending.errors.${state.error}`)}</span>
        </AuthAlert>
      ) : null}
      {state.status === "saved" ? (
        <AuthAlert tone="info">
          <span data-testid="pending-choose-saved">{t("pending.chooseSaved")}</span>
        </AuthAlert>
      ) : null}
      <Button type="submit" variant="secondary" loading={pending} data-testid="pending-choose-submit">
        {t("pending.chooseSave")}
      </Button>
    </form>
  );
}
