"use client";

import { History, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clearRecipeHistory, setRecipeHistory } from "@/app/(app)/profile/receitas/actions";
import { Button, Dialog, Switch, useToast } from "@/components/ui";

type Props = {
  enabled: boolean;
  /** "Ligado em …" (data do consentimento gravada pelo banco). */
  enabledLabel: string | null;
  hasItems: boolean;
};

// Interruptor do histórico (desligado por padrão) com o texto do consentimento. Desligar e limpar
// apagam o histórico, então os dois pedem confirmação num diálogo antes de chamar o servidor.
export function HistoryPanel({ enabled, enabledLabel, hasItems }: Props) {
  const t = useTranslations("kitchen.collection.history");
  const { toast } = useToast();
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [confirm, setConfirm] = useState<"disable" | "clear" | null>(null);
  const [pending, startTransition] = useTransition();

  const errorText = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));

  function onSwitch(next: boolean) {
    if (!next) {
      setConfirm("disable");
      return;
    }
    startTransition(async () => {
      const result = await setRecipeHistory({ enabled: true });
      if (!result.ok) {
        toast({ title: errorText(result.error), variant: "error" });
        return;
      }
      setOn(true);
      toast({ title: t("enabledToast"), variant: "success", duration: 2500 });
      router.refresh();
    });
  }

  function onConfirm() {
    const kind = confirm;
    startTransition(async () => {
      const result = kind === "disable" ? await setRecipeHistory({ enabled: false, confirm: true }) : await clearRecipeHistory({ confirm: true });
      if (!result.ok) {
        toast({ title: errorText(result.error), variant: "error" });
        return;
      }
      if (kind === "disable") setOn(false);
      setConfirm(null);
      toast({ title: kind === "disable" ? t("disabledToast") : t("clearedToast"), variant: "success", duration: 2500 });
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="history-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5" data-testid="history-panel">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-accent-text">
          <History className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="history-title" className="type-h3 text-fg">
            {t("title")}
          </h2>
          <p className="type-body-sm text-fg-muted" id="history-consent">
            {t("consent")}
          </p>
        </div>
      </div>
      <Switch
        id="history-switch"
        checked={on}
        onCheckedChange={onSwitch}
        disabled={pending}
        aria-describedby="history-consent"
        label={t("switch")}
        description={on ? (enabledLabel ?? t("on")) : t("off")}
        data-testid="history-switch"
      />
      {on && hasItems && (
        <Button variant="ghost" size="md" leadingIcon={<Trash2 />} onClick={() => setConfirm("clear")} disabled={pending} className="self-start" data-testid="history-clear">
          {t("clear")}
        </Button>
      )}

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirm(null);
        }}
        title={confirm === "clear" ? t("clearTitle") : t("disableTitle")}
        description={confirm === "clear" ? t("clearDescription") : t("disableDescription")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button variant="danger" onClick={onConfirm} loading={pending} data-testid="history-confirm">
              {confirm === "clear" ? t("clearConfirm") : t("disableConfirm")}
            </Button>
          </>
        }
      />
    </section>
  );
}
