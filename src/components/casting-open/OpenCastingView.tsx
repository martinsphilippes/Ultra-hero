import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TERRITORY_DOT } from "@/components/platform-calendar/territories";
import { Avatar, Button, EmptyState, Input, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { isMemberLevel } from "@/lib/team/levels";
import { HERO_SEGMENTS, isHeroSegment } from "@/lib/team/segments";
import { cn } from "@/lib/utils";
import { OpenCastingActions } from "./OpenCastingActions";

type Item = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  segments: string[] | null;
  level: string | null;
  category: string | null;
  agency: string;
  photo: string | null;
  access: "none" | "pending" | "approved";
};

const PAGE = 24;

// Casting aberto (0126): o casting das outras agências, só com o básico. Contato e valores só depois que a dona
// aprova o pedido ("⋯ → Solicitar acesso"). Busca por nome e filtro pelos segmentos do Calendário Groscove.
export async function OpenCastingView({ agencyId, q, segment, page, canRequest }: { agencyId: string; q?: string; segment?: string; page: number; canRequest: boolean }) {
  const [t, tg, tl, supabase] = await Promise.all([
    getTranslations("castingOpen"),
    getTranslations("groscoveCalendar.territories"),
    getTranslations("team.profile.levels"),
    createClient(),
  ]);
  const seg = isHeroSegment(segment) ? segment : null;
  const { data } = await supabase.rpc("casting_open_list", { p_agency: agencyId, p_query: q || null, p_segment: seg, p_limit: PAGE, p_offset: (page - 1) * PAGE });
  const result = (data ?? { total: 0, items: [] }) as { total: number; items: Item[] };
  const lastPage = Math.max(1, Math.ceil((result.total ?? 0) / PAGE));
  const href = (p: number) => {
    const params = new URLSearchParams({ aba: "aberto" });
    if (q) params.set("q", q);
    if (seg) params.set("territorio", seg);
    if (p > 1) params.set("page", String(p));
    return `/agencia/casting?${params.toString()}`;
  };

  return (
    <section className="flex flex-col gap-4" data-testid="open-casting">
      <p className="type-body-sm text-fg-muted">{t("description")}</p>
      <form method="get" className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="aba" value="aberto" />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
          <Input name="q" defaultValue={q ?? ""} placeholder={t("search")} aria-label={t("search")} className="pl-9" />
        </div>
        <Select name="territorio" defaultValue={seg ?? ""} aria-label={t("segment")} className="sm:w-56">
          <option value="">{t("allSegments")}</option>
          {HERO_SEGMENTS.map((s) => (
            <option key={s} value={s}>
              {tg(s)}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          {t("filter")}
        </Button>
      </form>
      <p className="type-caption text-fg-muted">{t("count", { count: result.total ?? 0 })}</p>
      {result.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {result.items.map((h) => (
            <li key={h.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="open-card">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar src={h.photo} name={h.name} size="md" alt="" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-fg">{h.name}</p>
                    <p className="truncate type-caption text-fg-muted">{[h.category, [h.city, h.state].filter(Boolean).join(" · ")].filter(Boolean).join(" · ")}</p>
                    <p className="truncate type-caption text-fg-subtle">{t("from", { agency: h.agency })}</p>
                  </div>
                </div>
                <OpenCastingActions talentId={h.id} access={h.access} canRequest={canRequest} />
              </div>
              {(h.segments?.length ?? 0) > 0 || isMemberLevel(h.level) ? (
                <ul className="flex flex-wrap gap-1.5">
                  {(h.segments ?? []).filter(isHeroSegment).map((s) => (
                    <li key={s} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-fg-muted">
                      <span aria-hidden="true" className={cn("size-2 rounded-full", TERRITORY_DOT[s])} />
                      {tg(s)}
                    </li>
                  ))}
                  {isMemberLevel(h.level) ? <li className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-text">{tl(`${h.level}.title`)}</li> : null}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {lastPage > 1 ? (
        <nav className="flex items-center justify-between gap-2" aria-label={t("pages")}>
          {page > 1 ? <a className="text-sm font-semibold text-accent-text" href={href(page - 1)}>{t("prev")}</a> : <span />}
          <span className="type-caption text-fg-muted">{t("pageOf", { page, total: lastPage })}</span>
          {page < lastPage ? <a className="text-sm font-semibold text-accent-text" href={href(page + 1)}>{t("next")}</a> : <span />}
        </nav>
      ) : null}
    </section>
  );
}
