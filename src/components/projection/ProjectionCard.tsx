import { TrendingUp } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { TERRITORY_DOT } from "@/components/platform-calendar/territories";
import { createClient } from "@/lib/supabase/server";
import { isHeroSegment } from "@/lib/team/segments";
import { cn } from "@/lib/utils";

type Bucket = { won_12m: number; open: number };
type Projection = { mine: Bucket | null; agency: Bucket | null; segments: Array<{ segment: string } & Bucket>; my_segments: string[] };

// Projeção (reunião Groscove): "projeção para você" e "projeção no seu segmento", para gestor e Hero. Anual =
// cachês fechados nos últimos 12 meses + o que está em aberto no pipeline (permuta não entra). Mostra o quanto está
// rolando para o segmento, para quem quiser trabalhar mais saber onde está a oportunidade.
export async function ProjectionCard({ agencyId }: { agencyId?: string }) {
  const [t, tg, locale, supabase] = await Promise.all([getTranslations("projection"), getTranslations("groscoveCalendar.territories"), getLocale(), createClient()]);
  const { data, error } = await supabase.rpc("finance_projection", { p_agency: agencyId ?? null });
  if (error || !data) return null;
  const p = data as Projection;
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format((cents ?? 0) / 100);
  const annual = (b: Bucket | null) => (b ? (b.won_12m ?? 0) + (b.open ?? 0) : 0);
  const mySegs = new Set<string>((p.my_segments ?? []).filter(isHeroSegment));
  const segments = (p.segments ?? []).filter((s) => isHeroSegment(s.segment)).sort((a, b) => Number(mySegs.has(b.segment)) - Number(mySegs.has(a.segment)) || annual(b) - annual(a));

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="projection-title" data-testid="projection">
      <div className="flex items-start gap-3">
        <TrendingUp className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
        <div className="flex flex-col gap-0.5">
          <h2 id="projection-title" className="type-h3 text-fg">
            {t("title")}
          </h2>
          <p className="type-caption text-fg-muted">{t("hint")}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-elevated p-3">
          <p className="type-caption text-fg-muted">{t("forYou")}</p>
          <p className="text-2xl font-bold text-fg">{money(annual(p.mine))}</p>
          <p className="type-caption text-fg-muted">{t("split", { won: money(p.mine?.won_12m ?? 0), open: money(p.mine?.open ?? 0) })}</p>
        </div>
        {p.agency ? (
          <div className="rounded-xl border border-border bg-surface-elevated p-3">
            <p className="type-caption text-fg-muted">{t("forAgency")}</p>
            <p className="text-2xl font-bold text-fg">{money(annual(p.agency))}</p>
            <p className="type-caption text-fg-muted">{t("split", { won: money(p.agency.won_12m ?? 0), open: money(p.agency.open ?? 0) })}</p>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-fg">{t("bySegment")}</h3>
        {segments.length === 0 ? (
          <p className="type-caption text-fg-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {segments.map((s) => (
              <li key={s.segment} className={cn("flex items-center justify-between gap-2 rounded-lg px-2 py-1.5", mySegs.has(s.segment) && "bg-accent-soft")}>
                <span className="inline-flex items-center gap-2 text-sm text-fg">
                  <span aria-hidden="true" className={cn("size-2.5 rounded-full", isHeroSegment(s.segment) ? TERRITORY_DOT[s.segment] : "")} />
                  {isHeroSegment(s.segment) ? tg(s.segment) : s.segment}
                  {mySegs.has(s.segment) ? <span className="type-caption text-accent-text">{t("yours")}</span> : null}
                </span>
                <span className="font-mono text-sm text-fg">{money(annual(s))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
