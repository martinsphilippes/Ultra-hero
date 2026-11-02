import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { formatAvg, onTimePct } from "@/lib/selection/logic";
import { getAgencyTalentRatings } from "@/lib/selection/queries";
import { getKit, listSocial } from "@/lib/talent/queries";
import { loadTalent } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("talentHistory") };
}

type Props = { params: Promise<{ id: string }> };

type Entry = { at: string; key: string; values?: Record<string, string> };

// Linha do tempo do talento a partir do que a ficha já registra (cadastro, contato, consentimento,
// redes, kit). Atividades e negócios entram com o pipeline (etapa C).
export default async function TalentHistoryPage({ params }: Props) {
  const { id } = await params;
  const { talent } = await loadTalent(id);
  const [t, tr, locale, kit, networks, ratings] = await Promise.all([
    getTranslations("agency.casting.history"),
    getTranslations("selection.rating"),
    getLocale() as Promise<Locale>,
    getKit(talent.id),
    listSocial(talent.id),
    getAgencyTalentRatings(talent.id),
  ]);
  const entries: Entry[] = [{ at: talent.createdAt, key: "created" }];
  if (talent.lastContactAt) entries.push({ at: talent.lastContactAt, key: "lastContact" });
  if (talent.consentAt) entries.push({ at: talent.consentAt, key: "consentGiven", values: { version: talent.consentVersion ?? "" } });
  if (talent.consentRevokedAt) entries.push({ at: talent.consentRevokedAt, key: "consentRevoked" });
  for (const n of networks) entries.push({ at: n.updated_at, key: "network", values: { handle: n.handle } });
  if (kit.updatedAt) entries.push({ at: kit.updatedAt, key: "kitUpdated" });
  if (kit.shareCreatedAt) entries.push({ at: kit.shareCreatedAt, key: "kitShared" });
  if (kit.shareRevokedAt) entries.push({ at: kit.shareRevokedAt, key: "kitRevoked" });
  if (kit.lastViewedAt) entries.push({ at: kit.lastViewedAt, key: "kitViewed", values: { count: String(kit.viewCount) } });
  if (talent.archivedAt) entries.push({ at: talent.archivedAt, key: "archived" });
  entries.sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="flex flex-col gap-6">
      {/* 0081: avaliações das marcas (prazo e qualidade por entrega), com a média do elenco */}
      {ratings ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="talent-ratings" data-testid="talent-ratings">
          <div className="flex flex-col gap-1">
            <h2 id="talent-ratings" className="text-base font-semibold text-fg">
              {tr("agencyTitle")}
            </h2>
            <p className="type-caption text-fg-muted">{tr("agencyHint")}</p>
          </div>
          {ratings.summary.count === 0 ? (
            <p className="type-body-sm text-fg-muted">{tr("agencyEmpty")}</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-fg" data-testid="talent-ratings-summary">
                {tr("agencySummary", { avg: formatAvg(ratings.summary.avg, locale) ?? "—", count: ratings.summary.count, brands: ratings.summary.brands, pct: onTimePct(ratings.summary) ?? 0 })}
              </p>
              <ul className="flex flex-col divide-y divide-border">
                {ratings.items.map((r) => (
                  <li key={r.id} className="flex flex-col gap-0.5 py-2">
                    <span className="text-sm font-medium text-fg">
                      {r.brandName} · {r.deliverableTitle || r.kind}
                    </span>
                    <span className="type-caption text-fg-muted">
                      {r.dealTitle} · {tr("done", { quality: r.quality, onTime: r.onTime ? tr("onTimeYes") : tr("onTimeNo"), name: r.ratedLabel || "—", date: formatDateTime(r.createdAt, locale) })}
                    </span>
                    {r.comment ? <span className="type-body-sm text-fg">“{r.comment}”</span> : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : null}
      <section className="flex flex-col gap-3" aria-labelledby="talent-history">
        <h2 id="talent-history" className="text-base font-semibold text-fg">
          {t("title")}
        </h2>
        <ol className="flex flex-col gap-0 border-l border-border pl-4" data-testid="talent-history">
          {entries.map((e, i) => (
            <li key={`${e.key}-${i}`} className="relative pb-4">
              <span aria-hidden="true" className="absolute -left-[1.3rem] top-1.5 size-2.5 rounded-full bg-accent" />
              <p className="text-sm text-fg">{t(`entries.${e.key}`, e.values ?? {})}</p>
              <p className="type-caption text-fg-muted">{formatDateTime(e.at, locale)}</p>
            </li>
          ))}
        </ol>
        <p className="type-caption text-fg-muted">{t("upcoming")}</p>
      </section>
    </div>
  );
}
