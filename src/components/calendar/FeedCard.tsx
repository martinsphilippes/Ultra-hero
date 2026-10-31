"use client";

import { Download, Link2, RefreshCw, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { CopyButton } from "@/components/admin-ops/CopyButton";
import { Button, Input, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { createFeedAction, revokeFeedAction, type FeedPortal } from "@/lib/calendar/actions";

type Props = { portal: FeedPortal; origin: string; state: { active: boolean; rotatedAt: string | null; lastFetchedAt: string | null; fetchCount: number } | null };

// Feed .ics da pessoa: assinar no Google/Apple/Outlook ou baixar. O link aparece UMA vez (o banco guarda só o
// hash); gerar de novo invalida o anterior; revogar desliga.
export function FeedCard({ portal, origin, state }: Props) {
  const t = useTranslations("commercial.feed");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function create() {
    if (state?.active && !window.confirm(t("confirmRotate"))) return;
    start(async () => {
      const result = await createFeedAction(portal);
      if (!result.ok || !result.token) {
        toast({ title: result.ok ? result.message : result.error, variant: "error" });
        return;
      }
      setUrl(`${origin}/api/agenda/${result.token}.ics`);
      toast({ title: result.message, variant: "success" });
    });
  }

  function revoke() {
    if (!window.confirm(t("confirmRevoke"))) return;
    start(async () => {
      const result = await revokeFeedAction(portal);
      if (result.ok) setUrl(null);
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" aria-labelledby="feed-title" data-testid="feed-card">
      <h2 id="feed-title" className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Link2 className="size-4" aria-hidden="true" />
        {t("title")}
      </h2>
      <p className="type-body-sm text-fg-muted">{t("hint")}</p>
      {url ? (
        <div className="flex flex-col gap-2" data-testid="feed-url">
          <p className="type-caption text-warning">{t("showOnce")}</p>
          <div className="flex gap-2">
            <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="flex-1" />
            <CopyButton value={url} />
          </div>
          <a href={`${url}?download=1`} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-text underline-offset-2 hover:underline">
            <Download className="size-4" aria-hidden="true" />
            {t("download")}
          </a>
        </div>
      ) : state?.active ? (
        <p className="type-body-sm text-fg" data-testid="feed-active">
          {t("active", { date: state.rotatedAt ? formatDateTime(state.rotatedAt, locale) : "" })}
          {state.lastFetchedAt ? ` · ${t("lastFetched", { date: formatDateTime(state.lastFetchedAt, locale), count: state.fetchCount })}` : ""}
        </p>
      ) : (
        <p className="type-body-sm text-fg-muted">{t("inactive")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={state?.active ? "secondary" : "primary"} leadingIcon={state?.active ? <RefreshCw /> : <Link2 />} onClick={create} loading={pending} data-testid="feed-create">
          {state?.active ? t("rotate") : t("create")}
        </Button>
        {state?.active ? (
          <Button type="button" size="sm" variant="ghost" leadingIcon={<XCircle />} onClick={revoke} disabled={pending}>
            {t("revoke")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
