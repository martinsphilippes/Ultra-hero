import { Flame, Hash, Sparkles, TrendingUp } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AgendaFilterBar } from "@/components/platform-calendar/AgendaFilterBar";
import { EmptyState } from "@/components/ui";
import type { CultureData } from "@/lib/culture/queries";
import { AGENDA_BASE } from "@/lib/culture/links";
import { displayTag, type CultureMeta } from "@/lib/culture/select";
import type { AgendaFilters } from "@/lib/platform-calendar/vocab";
import { CultureEventCard, type CultureActions } from "./CultureEventCard";
import { PostCard } from "./PostCard";

type Props = { data: CultureData; actions: CultureActions; filters: AgendaFilters };

function Lane({ id, title, icon, children }: { id: string; title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby={`culture-${id}`} data-testid={`culture-lane-${id}`}>
      <h2 id={`culture-${id}`} className="flex items-center gap-2 text-base font-semibold text-fg [&_svg]:size-4 [&_svg]:text-accent-text">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Hashtags do mês e tendências do trimestre (calendar_imports.meta, 0099/0101). */
export async function CultureTrends({ meta }: { meta: CultureMeta }) {
  if (!meta.month && !meta.quarter) return null;
  const t = await getTranslations("culture.trends");
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent-soft/40 p-4" data-testid="culture-trends">
      {meta.month ? (
        <div className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Hash className="size-4 text-accent-text" aria-hidden="true" />
            {t("month")}
            {meta.month.label ? <span className="font-normal text-fg-muted">· {meta.month.label}</span> : null}
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {meta.month.hashtags.map((h) => (
              <li key={h} className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-accent-text">
                {displayTag(h)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {meta.quarter ? (
        <div className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <TrendingUp className="size-4 text-accent-text" aria-hidden="true" />
            {t("quarter", { quarter: meta.quarter.quarter })}
          </h2>
          {meta.quarter.trendingTopics.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {meta.quarter.trendingTopics.map((h) => (
                <li key={h} className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg">
                  {displayTag(h)}
                </li>
              ))}
            </ul>
          ) : null}
          {meta.quarter.summary ? <p className="type-body-sm text-fg-muted">{meta.quarter.summary}</p> : null}
          {meta.quarter.territories.length > 0 ? <p className="type-caption text-fg-muted">{t("territories", { list: meta.quarter.territories.join(", ") })}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

// Real-Time Culture (0101): leitura do Calendário Groscove recortada em faixas (agora, temporadas, destaques, com
// oportunidades, 7 e 30 dias), notícias/dicas da Groscove e da agência, hashtags do mês e tendências do trimestre.
// Igual nos quatro portais; muda só a ação de cada cartão. Sem calendário próprio: todo cartão abre o evento da agenda.
export async function CultureView({ data, actions, filters }: Props) {
  const t = await getTranslations("culture");
  const { lanes } = data;
  const card = (e: (typeof lanes.next7)[number], season = false) => (
    <CultureEventCard key={e.id} event={e} actions={actions} interest={data.interests.get(e.id) ?? null} opportunities={null} season={season} />
  );
  const nothing =
    lanes.happening.length + lanes.seasons.length + lanes.featured.length + lanes.next7.length + lanes.next30.length + data.withOpportunities.length === 0;
  return (
    <div className="flex flex-col gap-5" data-testid="culture-view">
      <CultureTrends meta={data.meta} />
      <AgendaFilterBar base={`${AGENDA_BASE[actions.portal]}/cultura`} params={{}} filters={{ ...filters, mode: "all", collection: null }} collections={[]} showMode={false} />
      {nothing ? (
        <div className="rounded-2xl border border-border bg-surface" data-testid="culture-empty">
          <EmptyState icon={<Sparkles />} title={t("page.empty")} description={t("page.emptyHint")} />
        </div>
      ) : null}
      {lanes.happening.length > 0 || lanes.seasons.length > 0 ? (
        <Lane id="happening" title={t("lanes.happening")} icon={<Flame aria-hidden="true" />}>
          {lanes.happening.length > 0 ? <ul className="grid gap-2 sm:grid-cols-2">{lanes.happening.map((e) => card(e))}</ul> : null}
          {lanes.seasons.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="type-caption font-semibold uppercase tracking-wide text-fg-muted">{t("lanes.seasons")}</h3>
              <ul className="grid gap-2 sm:grid-cols-2">{lanes.seasons.map((e) => card(e, true))}</ul>
            </div>
          ) : null}
        </Lane>
      ) : null}
      {lanes.featured.length > 0 ? (
        <Lane id="featured" title={t("lanes.featured")} icon={<Sparkles aria-hidden="true" />}>
          <ul className="grid gap-2 sm:grid-cols-2">{lanes.featured.map((e) => card(e))}</ul>
        </Lane>
      ) : null}
      {data.withOpportunities.length > 0 ? (
        <Lane id="opportunities" title={t("lanes.opportunities")}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.withOpportunities.map(({ event, counts }) => (
              <CultureEventCard key={event.id} event={event} actions={actions} interest={data.interests.get(event.id) ?? null} opportunities={counts} />
            ))}
          </ul>
        </Lane>
      ) : null}
      {lanes.next7.length > 0 ? (
        <Lane id="next7" title={t("lanes.next7")}>
          <ul className="grid gap-2 sm:grid-cols-2">{lanes.next7.map((e) => card(e))}</ul>
        </Lane>
      ) : null}
      <Lane id="posts" title={t("lanes.posts")}>
        {data.posts.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.posts.map((p) => (
              <PostCard key={p.id} post={p} portal={actions.portal} />
            ))}
          </ul>
        ) : (
          <p className="type-body-sm text-fg-muted">{t("posts.empty")}</p>
        )}
      </Lane>
      {lanes.next30.length > 0 ? (
        <Lane id="next30" title={t("lanes.next30")}>
          <ul className="grid gap-2 sm:grid-cols-2">{lanes.next30.map((e) => card(e))}</ul>
        </Lane>
      ) : null}
    </div>
  );
}
