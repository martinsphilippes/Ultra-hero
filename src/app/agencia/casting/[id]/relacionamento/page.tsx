import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-universe/BrandLogo";
import { FormatInterestForm, IdeaStatusControl } from "@/components/creator-guide/GuideForms";
import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate, formatDateTime } from "@/i18n/format";
import { FORMAT_KEYS, type FormatInterest } from "@/lib/creator-guide/format";
import { loadTalentRelationship } from "@/lib/creator-guide/queries";
import { loadTalent } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creatorGuide.teamView");
  return { title: t("title") };
}

type Props = { params: Promise<{ id: string }> };

const card = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5";
const INTEREST_VARIANT: Record<FormatInterest, "success" | "warning" | "neutral"> = { yes: "success", maybe: "warning", no: "neutral" };

// Relacionamento (0136): o que o creator marcou no portal (formatos, ação aberta, universos, marcas, projeto autoral) e
// o que a equipe registrou na reunião. Toda a equipe da agência vê e registra formatos; gestor+ dá andamento ao projeto.
export default async function TalentRelationshipPage({ params }: Props) {
  const { id } = await params;
  const { talent } = await loadTalent(id);
  const [t, locale, rel] = await Promise.all([getTranslations("creatorGuide"), getLocale() as Promise<Locale>, loadTalentRelationship(talent.id)]);
  if (!rel) return null;
  const chips = (list: { id: string; name: string; logo_url: string | null }[]) =>
    list.length > 0 ? (
      <ul className="flex flex-wrap gap-2">
        {list.map((b) => (
          <li key={b.id} className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3">
            <BrandLogo name={b.name} url={b.logo_url} size="sm" />
            <span className="text-sm text-fg">{b.name}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="type-caption text-fg-muted">{t("teamView.noneMarked")}</p>
    );

  return (
    <div className="flex flex-col gap-5" data-testid="talent-relationship">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-fg">{t("teamView.title")}</h2>
        <p className="type-body-sm text-fg-muted">{t("teamView.lead")}</p>
        {rel.updatedAt ? <p className="type-caption text-fg-muted">{t("teamView.updatedAt", { date: formatDateTime(rel.updatedAt, locale) })}</p> : null}
      </div>

      <section className={card} aria-labelledby="rel-formats">
        <h3 id="rel-formats" className="text-base font-semibold text-fg">
          {t("teamView.formats")}
        </h3>
        <p className="type-caption text-fg-muted">{t("teamView.recordHint")}</p>
        <ul className="grid gap-3 lg:grid-cols-2">
          {FORMAT_KEYS.map((key) => {
            const choice = rel.formats[key];
            return (
              <li key={key} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-fg">{t(`formats.items.${key}.title`)}</p>
                  <Badge size="sm" variant={choice ? INTEREST_VARIANT[choice.interest] : "neutral"}>
                    {choice ? t(`formats.interest.${choice.interest}`) : t("teamView.notAnswered")}
                  </Badge>
                </div>
                {choice?.note ? <p className="type-body-sm text-fg">{choice.note}</p> : null}
                <details>
                  <summary className="cursor-pointer type-caption font-semibold text-accent-text">{t("teamView.recordHint")}</summary>
                  <div className="pt-2">
                    <FormatInterestForm formatKey={key} initial={choice ?? null} talentId={talent.id} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={card} aria-labelledby="rel-actions">
        <h3 id="rel-actions" className="text-base font-semibold text-fg">
          {t("teamView.actions")}
        </h3>
        {rel.actions.length === 0 ? (
          <p className="type-caption text-fg-muted">{t("teamView.noActions")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rel.actions.map((a) => (
              <li key={a.key} className="flex flex-col gap-1 rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-fg">{a.title}</p>
                  <Badge size="sm" variant={a.interest === "yes" ? "success" : a.interest === "depends" ? "warning" : "neutral"}>
                    {t(`actions.interest.${a.interest}`)}
                  </Badge>
                </div>
                {a.categories ? <p className="type-body-sm text-fg">{`${t("actions.categories")}: ${a.categories}`}</p> : null}
                {a.availability ? <p className="type-body-sm text-fg">{`${t("actions.availability")}: ${a.availability}`}</p> : null}
                {a.notes ? <p className="type-body-sm text-fg-muted">{a.notes}</p> : null}
                <Link href={`/agencia/casting/acoes/${a.key}`} className="w-fit type-caption font-semibold text-accent-text underline-offset-4 hover:underline">
                  {t("teamView.seeAnswers")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card} aria-labelledby="rel-universes">
        <h3 id="rel-universes" className="text-base font-semibold text-fg">
          {t("teamView.universes")}
        </h3>
        {rel.universes.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {rel.universes.map((u) => (
              <li key={u.slug}>
                <Badge size="sm" variant="info">
                  {u.name}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-caption text-fg-muted">{t("teamView.noneMarked")}</p>
        )}
        <h4 className="text-sm font-semibold text-fg">{t("teamView.brandsKnown")}</h4>
        {chips(rel.brandsKnown)}
        <h4 className="text-sm font-semibold text-fg">{t("teamView.brandsExplore")}</h4>
        {chips(rel.brandsExplore)}
      </section>

      <section className={card} aria-labelledby="projetos-autorais-title" id="projetos-autorais">
        <h3 id="projetos-autorais-title" className="text-base font-semibold text-fg">
          {t("teamView.ideas")}
        </h3>
        {rel.ideas.length === 0 ? (
          <p className="type-caption text-fg-muted">{t("teamView.noIdeas")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rel.ideas.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 rounded-xl border border-border p-3" data-testid="team-idea">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-fg">{i.title}</p>
                  <Badge size="sm" variant={i.status === "prospecting" ? "success" : i.status === "closed" ? "neutral" : "info"}>
                    {t(`idea.status.${i.status}`)}
                  </Badge>
                </div>
                <p className="type-caption text-fg-muted">{t("idea.sentOn", { date: formatDate(i.created_at, locale) })}</p>
                <dl className="grid gap-2 sm:grid-cols-2">
                  {(["concept", "audience", "format", "location", "timeline", "stage", "partners", "needs"] as const)
                    .filter((f) => i[f])
                    .map((f) => (
                      <div key={f} className={f === "concept" ? "sm:col-span-2" : undefined}>
                        <dt className="type-caption font-semibold text-fg-muted">{t(`idea.fields.${f}`)}</dt>
                        <dd className="type-body-sm whitespace-pre-line text-fg">{i[f]}</dd>
                      </div>
                    ))}
                </dl>
                {rel.canManage ? (
                  <IdeaStatusControl id={i.id} talentId={talent.id} status={i.status} note={i.team_note} />
                ) : i.team_note ? (
                  <p className="type-body-sm text-fg-muted">{`${t("teamView.teamNote")}: ${i.team_note}`}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
