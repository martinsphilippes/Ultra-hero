"use client";

import { Copy, Eye, EyeOff, KeyRound, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { regenerateMyPassword, revealMyPassword } from "@/app/(app)/profile/account/actions";
import { Button, Dialog, useToast } from "@/components/ui";

/** stored: há senha gerada guardada; google: só Google; own: senha escolhida pela pessoa; unavailable. */
export type PasswordCardMode = "stored" | "google" | "own" | "unavailable";

type Props = { mode: PasswordCardMode; canGenerate: boolean };

// "Sua senha": escondida por padrão; Mostrar decifra no servidor só para a pessoa da sessão.
export function AccountPasswordCard({ mode: initialMode, canGenerate }: Props) {
  const t = useTranslations("me.account.password");
  const tc = useTranslations("common.actions");
  const { toast } = useToast();
  const [mode, setMode] = useState(initialMode);
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notStored, setNotStored] = useState(false);
  const [pending, startTransition] = useTransition();

  const message = (key: string) => (t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.generic"));

  function reveal() {
    if (password) {
      setPassword(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await revealMyPassword();
      if (result.ok) setPassword(result.password);
      else setError(message(result.error));
    });
  }

  async function copy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      toast({ title: t("copied"), variant: "success" });
    } catch {
      toast({ title: t("copyFailed"), variant: "error" });
    }
  }

  function regenerate() {
    setError(null);
    startTransition(async () => {
      const result = await regenerateMyPassword();
      setConfirmOpen(false);
      if (!result.ok) {
        setError(message(result.error));
        return;
      }
      setPassword(result.password);
      setNotStored(!result.stored);
      setMode(result.stored ? "stored" : "own");
      toast({ title: t("generated"), variant: "success" });
    });
  }

  const description =
    mode === "stored" ? t("storedDescription") : mode === "google" ? t("googleDescription") : mode === "own" ? t("ownDescription") : t("unavailableDescription");

  return (
    <section aria-labelledby="password-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5" data-testid="account-password">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-accent-text">
          <KeyRound className="size-5" />
        </span>
        <h2 id="password-title" className="type-h3 text-fg">
          {t("title")}
        </h2>
      </div>
      <p className="type-body-sm text-fg-muted">{description}</p>

      {mode === "stored" || password ? (
        <p className="rounded-xl border border-border bg-surface-elevated px-4 py-3 text-center font-mono text-2xl font-bold tracking-wider text-fg" translate="no" data-testid="account-password-value">
          {password ?? "••••••••"}
        </p>
      ) : null}
      {notStored && password ? <p className="type-caption text-warning">{t("notStoredNote")}</p> : null}

      <div className="flex flex-wrap gap-2">
        {mode === "stored" || password ? (
          <Button type="button" variant="secondary" onClick={reveal} loading={pending && !confirmOpen} leadingIcon={password ? <EyeOff /> : <Eye />} aria-pressed={Boolean(password)}>
            {password ? t("hide") : t("show")}
          </Button>
        ) : null}
        {password ? (
          <Button type="button" variant="secondary" onClick={copy} leadingIcon={<Copy />}>
            {t("copy")}
          </Button>
        ) : null}
        {canGenerate && mode !== "unavailable" ? (
          <Button type="button" variant="ghost" onClick={() => setConfirmOpen(true)} leadingIcon={<RefreshCw />}>
            {mode === "google" ? t("create") : t("generate")}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}

      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!pending) setConfirmOpen(next);
        }}
        title={mode === "google" ? t("confirmCreateTitle") : t("confirmTitle")}
        description={t("confirmDescription")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button onClick={regenerate} loading={pending}>
              {mode === "google" ? t("create") : t("generate")}
            </Button>
          </>
        }
      >
        <p className="type-body-sm text-fg-muted">{t("confirmBody")}</p>
      </Dialog>
    </section>
  );
}
