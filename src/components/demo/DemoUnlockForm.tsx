"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { unlockDemoAccess, type DemoUnlockState } from "@/app/demo-actions";
import { Button, Input } from "@/components/ui";

// Campo do código que libera o acesso rápido neste navegador.
export function DemoUnlockForm() {
  const t = useTranslations("demo");
  const [state, action, pending] = useActionState<DemoUnlockState, FormData>(unlockDemoAccess, { status: "idle" });
  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="demo-code" className="text-sm text-fg-muted">
        {t("codeLabel")}
      </label>
      <div className="flex gap-2">
        <Input id="demo-code" name="code" autoComplete="off" autoCapitalize="characters" spellCheck={false} required aria-invalid={state.status === "error" || undefined} aria-describedby={state.status === "error" ? "demo-code-error" : undefined} />
        <Button type="submit" variant="primary" loading={pending}>
          {t("unlock")}
        </Button>
      </div>
      {state.status === "error" ? (
        <p id="demo-code-error" role="alert" className="type-caption text-danger">
          {t("codeError")}
        </p>
      ) : null}
    </form>
  );
}
