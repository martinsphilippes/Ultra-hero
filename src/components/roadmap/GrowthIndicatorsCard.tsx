import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { KpiCard } from "@/components/admin-ops/KpiCard";
import type { GrowthIndicators } from "@/lib/roadmap/phase3-queries";

// Nova venda (0111, D4; gestor+): dos negócios ganhos nos últimos 180 dias, quantos tiveram um "próximo negócio"
// (ligado pelo clipping ou aberto para o mesmo cliente até 180 dias depois). A satisfação (0110) e o no prazo por
// serviço (0107) seguem nos cartões ao lado.
export async function GrowthIndicatorsCard({ data }: { data: GrowthIndicators }) {
  const t = await getTranslations("roadmap.growth");
  const pct = data.won > 0 ? Math.round((data.withNext / data.won) * 100) : null;
  return (
    <section aria-labelledby="growth-indicators" className="flex flex-col gap-3" data-testid="growth-indicators">
      <div className="flex flex-col gap-0.5">
        <h2 id="growth-indicators" className="text-sm font-semibold text-fg">
          {t("title")}
        </h2>
        <p className="type-caption text-fg-muted">{t("description")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("rate")} value={pct === null ? "—" : `${pct}%`} hint={data.won > 0 ? t("rateHint", { next: data.withNext, won: data.won }) : t("noData")} />
        <KpiCard label={t("linked")} value={data.linked} hint={t("linkedHint")} />
      </div>
      {data.services.length > 0 || data.recent.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {data.services.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
              <h3 className="type-caption font-semibold text-fg-muted">{t("byService")}</h3>
              <ul className="flex flex-col gap-1">
                {data.services.map((s) => (
                  <li key={s.service} className="flex justify-between gap-2 text-sm">
                    <span className="text-fg">{s.service || t("noService")}</span>
                    <span className="type-caption text-fg-muted type-numeric">{t("serviceRow", { next: s.withNext, won: s.won })}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.recent.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
              <h3 className="type-caption font-semibold text-fg-muted">{t("recent")}</h3>
              <ul className="flex flex-col gap-1.5">
                {data.recent.map((r) => (
                  <li key={r.id} className="flex flex-col text-sm">
                    <Link href={`/agencia/negocios/${r.id}`} className="inline-flex min-h-11 items-center font-medium text-accent-text underline-offset-2 hover:underline">
                      {r.title}
                    </Link>
                    <span className="type-caption text-fg-muted">{t("from", { origin: r.origin })}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
