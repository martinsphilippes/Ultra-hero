import { ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { AGENDA_BASE, eventHref, type CulturePortal } from "@/lib/culture/links";
import { loadCultureSummary, type CultureSummary } from "@/lib/culture/queries";
import { displayTag } from "@/lib/culture/select";

// Cartão "Real-Time Culture" no Início de cada portal (0101): o que acontece agora, o que vem nos próximos dias e as
// hashtags do mês, com atalho para a aba Cultura da agenda. Nada aparece se não há evento nem hashtag.
export async function CultureHomeCard({ summary, portal }: { summary: CultureSummary; portal: CulturePortal }) {
  if (!summary.available || (summary.now.length + summary.soon.length === 0 && summary.hashtags.length === 0)) return null;
  const [t, locale] = await Promise.all([getTranslations("culture.home"), getLocale() as Promise<Locale>]);
  const row = (e: CultureSummary["now"][number], label: string) => (
    <li key={e.id}>
      <Link href={eventHref(portal, e.id)} className="flex min-h-11 items-center justify-between gap-2 py-1.5">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-fg">{e.title}</span>
          <span className="type-caption text-fg-muted">
            {label} · {formatDate(e.startsAt, locale, { day: "numeric", month: "short" }, e.timezone)}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
      </Link>
    </li>
  );
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent-soft/40 p-4" aria-labelledby="culture-home-title" data-testid="culture-home-card">
      <div className="flex items-center justify-between gap-2">
        <h2 id="culture-home-title" className="flex items-center gap-2 text-base font-semibold text-fg">
          <Sparkles className="size-4 text-accent-text" aria-hidden="true" />
          {t("title")}
        </h2>
        <Link href={`${AGENDA_BASE[portal]}/cultura`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text underline-offset-2 hover:underline" data-testid="culture-home-open">
          {t("open")}
        </Link>
      </div>
      {summary.hashtags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={t("tags")}>
          {summary.hashtags.map((h) => (
            <li key={h} className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-accent-text">
              {displayTag(h)}
            </li>
          ))}
        </ul>
      ) : null}
      {summary.now.length + summary.soon.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {summary.now.map((e) => row(e, t("now")))}
          {summary.soon.map((e) => row(e, t("soon")))}
        </ul>
      ) : (
        <p className="type-body-sm text-fg-muted">{t("empty")}</p>
      )}
    </section>
  );
}

/** Carrega e mostra o cartão (usado dentro de <Suspense> no Início dos portais, para não atrasar o resto da tela). */
export async function CultureHome({ portal }: { portal: CulturePortal }) {
  const summary = await loadCultureSummary();
  return <CultureHomeCard summary={summary} portal={portal} />;
}
