"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button, Switch, useToast } from "@/components/ui";
import { restoreDefaultAction, setThemesEnabledAction } from "@/lib/seasonal-theme/actions";

// Interruptor global "layouts dinâmicos ativados" e "restaurar padrão agora" (despublica os temas em vigor).
export function ThemesControls({ enabled, activeCount }: { enabled: boolean; activeCount: number }) {
  const t = useTranslations("seasonalTheme.admin");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    start(async () => {
      const result = await fn();
      toast({ title: result.ok ? (result.message ?? "") : (result.error ?? ""), variant: result.ok ? "success" : "error" });
      if (result.ok) router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="themes-controls">
      <Switch checked={enabled} disabled={pending} onCheckedChange={(on) => run(() => setThemesEnabledAction({ enabled: on }))} label={t("globalSwitch")} description={enabled ? t("globalOnHint") : t("globalOffHint")} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          leadingIcon={<RotateCcw />}
          disabled={pending || activeCount === 0}
          onClick={() => {
            if (window.confirm(t("restoreConfirm", { count: activeCount }))) run(() => restoreDefaultAction());
          }}
          data-testid="themes-restore"
        >
          {t("restore")}
        </Button>
        <span className="type-body-sm text-fg-muted">{t("restoreHint")}</span>
      </div>
    </section>
  );
}
