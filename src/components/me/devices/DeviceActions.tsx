"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { disconnectWearable, reduceHealthConsent, revokeHealthConsent } from "@/app/(app)/profile/devices/actions";
import { Button, Checkbox, Dialog, useToast } from "@/components/ui";
import type { HealthCategory } from "@/lib/health/types";

// Desconectar e retirar consentimento: sempre com confirmação, apagam na hora e nunca são
// bloqueados (RF-07, RF-09). A revogação na marca vai para a fila no servidor.

function ConfirmButton({ label, title, body, confirmLabel, run, testId }: { label: string; title: string; body: string; confirmLabel: string; run: () => Promise<{ ok: boolean; error?: string }>; testId: string }) {
  const t = useTranslations("devices");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} data-testid={testId}>
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={body}
        size="sm"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t("disconnect.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await run();
                  if (!result.ok) {
                    setError(t(`errors.${result.error ?? "generic"}`));
                    return;
                  }
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
        <span className="sr-only" aria-live="polite">
          {pending ? "…" : ""}
        </span>
      </Dialog>
    </>
  );
}

export function DisconnectButton({ connectionId, brand }: { connectionId: string; brand: string }) {
  const t = useTranslations("devices");
  const { toast } = useToast();
  return (
    <ConfirmButton
      testId="device-disconnect"
      label={t("disconnect.cta")}
      title={t("disconnect.title", { brand })}
      body={t("disconnect.body", { brand })}
      confirmLabel={t("disconnect.confirm")}
      run={async () => {
        const result = await disconnectWearable({ connectionId });
        if (result.ok) toast({ title: t("disconnect.done"), variant: "success" });
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }}
    />
  );
}

export function RevokeConsentButton() {
  const t = useTranslations("devices");
  const { toast } = useToast();
  return (
    <ConfirmButton
      testId="consent-revoke"
      label={t("consentPanel.revokeCta")}
      title={t("consentPanel.revokeTitle")}
      body={t("consentPanel.revokeBody")}
      confirmLabel={t("consentPanel.revokeConfirm")}
      run={async () => {
        const result = await revokeHealthConsent();
        if (result.ok) toast({ title: t("consentPanel.revoked"), variant: "success" });
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }}
    />
  );
}

/** Retirar categorias: desmarcar e salvar apaga só os dados delas (ampliar exige novo aceite). */
export function ReduceCategoriesForm({ granted }: { granted: readonly HealthCategory[] }) {
  const t = useTranslations("devices");
  const id = useId();
  const router = useRouter();
  const { toast } = useToast();
  const [keep, setKeep] = useState<Set<HealthCategory>>(() => new Set(granted));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const removed = granted.filter((c) => !keep.has(c));
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (keep.size === 0) return setError(t("errors.categories"));
        startTransition(async () => {
          const result = await reduceHealthConsent({ categories: [...keep] });
          if (!result.ok) return setError(t(`errors.${result.error}`));
          setError(null);
          toast({ title: t("consentPanel.reduced"), variant: "success" });
          router.refresh();
        });
      }}
    >
      <fieldset className="flex flex-col">
        <legend className="type-body-sm font-semibold text-fg">{t("consentPanel.categoriesTitle")}</legend>
        {granted.map((c) => (
          <Checkbox
            key={c}
            id={`${id}-${c}`}
            checked={keep.has(c)}
            onChange={() =>
              setKeep((prev) => {
                const next = new Set(prev);
                if (next.has(c)) next.delete(c);
                else next.add(c);
                return next;
              })
            }
            label={t(`categories.${c}.name`)}
          />
        ))}
      </fieldset>
      <p className="type-caption text-fg-muted">{t("consentPanel.reduceHint")}</p>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" size="sm" disabled={removed.length === 0} loading={pending} className="self-start">
        {t("consentPanel.reduceSave")}
      </Button>
    </form>
  );
}
