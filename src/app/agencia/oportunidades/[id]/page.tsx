import type { Metadata } from "next";
import { ArrowLeft, Pencil } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompensationView } from "@/components/compensation/CompensationView";
import { AgencyProposalsPanel } from "@/components/sponsorship/AgencyProposalsPanel";
import { HeroCard } from "@/components/sponsorship/HeroCard";
import { PublicChips } from "@/components/sponsorship/NegotiationView";
import { SponsorshipDecide } from "@/components/sponsorship/SponsorshipDecide";
import { SponsorshipDraftPanel } from "@/components/sponsorship/SponsorshipDraftPanel";
import { SponsorshipForm } from "@/components/sponsorship/SponsorshipForm";
import { SponsorshipFacts, SponsorshipStatusBadge } from "@/components/sponsorship/SponsorshipView";
import { Badge, PageHeader, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { listAgencyBrands } from "@/lib/agency/queries";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { draftFrom } from "@/lib/compensation/model";
import { formatCents } from "@/lib/deals/schemas";
import { centsToBrl } from "@/lib/money/brl-input";
import { choiceFromHeroInfo } from "@/lib/sponsorship/hero-pick";
import { EMPTY_PUBLIC, tierMissingPrice, tierTotalCents } from "@/lib/sponsorship/negotiation";
import { getAgencySponsorship } from "@/lib/sponsorship/queries";
import { canDecide, localParts, responseCounts, type AgencySponsorshipBrand } from "@/lib/sponsorship/vocab";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("sponsorship") };
}

type Props = { params: Promise<{ id: string }> };

const RESPONSE_VARIANT: Record<"interested" | "declined" | "pending", BadgeVariant> = { interested: "success", declined: "neutral", pending: "warning" };

// Ficha da oportunidade (0085), gestor+: o Hero (0095), resumo, marca por marca (quis, recusou, sem resposta; quem e
// quando; a campanha que nasceu do interesse), a decisão e a edição enquanto rascunho ou aberta. Rascunho: painel com
// publicar (exige o consentimento do Hero; atalhos da ficha e dos Documentos) e descartar.
// 0140: cada cota mostra como a marca paga (Valor, Permuta, Performance); sem dinheiro, nada de "sem valor pedido".
// Números da permuta/performance só para o Adm.
export default async function AgencySponsorshipPage({ params }: Props) {
  const ctx = await requireAgency("manager");
  const { id } = await params;
  const o = await getAgencySponsorship(id);
  if (!o || o.agencyId !== ctx.agency.id) notFound();
  const tz = ctx.agency.timezone || "America/Sao_Paulo";
  const [t, tvm, locale, brands] = await Promise.all([getTranslations("sponsorship.agency"), getTranslations("sponsorship.tierValue"), getLocale() as Promise<Locale>, listAgencyBrands(ctx.agency.id)]);
  const counts = responseCounts(o.brands);
  const interested = o.brands.filter((b) => b.response === "interested");
  const start = localParts(o.startsAt, tz);
  const allDayEnd = localParts(new Date(Math.max(Date.parse(o.startsAt), Date.parse(o.endsAt) - 60_000)).toISOString(), tz);
  const end = localParts(o.endsAt, tz);
  const respond = localParts(o.respondBy, tz);
  const responded = o.brands.some((b) => b.response !== null);
  const canValues = o.canValues && agencyCan(ctx.role, "admin", ctx.platformAdmin);
  const agreedBrands = Array.from(new Set(o.proposals.filter((p) => p.status === "agreed").map((p) => p.brandId)));

  const brandLine = (b: AgencySponsorshipBrand) => {
    const state = b.response ?? "pending";
    return (
      <li key={b.brandId} className="flex flex-col gap-1.5 p-3" data-testid="sponsorship-brand" data-response={state}>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-fg">{b.name}</span>
          <Badge size="sm" variant={RESPONSE_VARIANT[state]}>
            {t(`response.${state}`)}
          </Badge>
          {b.outcome ? (
            <Badge size="sm" variant={b.outcome === "won" ? "accent" : "neutral"}>
              {t(`outcome.${b.outcome}`)}
            </Badge>
          ) : null}
        </span>
        {b.respondedAt ? <span className="type-caption text-fg-muted">{t("respondedBy", { name: b.respondedLabel || "—", date: formatDateTime(b.respondedAt, locale, tz) })}</span> : null}
        {b.message ? <span className="type-body-sm text-fg">“{b.message}”</span> : null}
        {b.requestStatus ? (
          <span className="flex flex-wrap items-center gap-2 type-caption text-fg-muted">
            {t(`request.${["draft", "converted", "cancelled"].includes(b.requestStatus) ? b.requestStatus : "other"}`)}
            {b.dealId ? (
              <Link href={`/agencia/negocios/${b.dealId}`} className="font-medium text-accent-text underline-offset-2 hover:underline">
                {t("openDeal")}
              </Link>
            ) : null}
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-5" data-testid="agency-sponsorship">
      <Link href="/agencia/oportunidades" className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-accent-text underline-offset-2 hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("back")}
      </Link>
      <PageHeader title={o.title} description={o.audience === "all" ? t("audienceAll") : t("audienceSelected", { count: o.targetIds.length })} actions={<SponsorshipStatusBadge status={o.status} closedReason={o.closedReason} />} />
      {o.status === "draft" ? <SponsorshipDraftPanel id={o.id} hero={o.hero} /> : null}
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <HeroCard hero={o.hero} side="agency" />
        <SponsorshipFacts o={o} timeZone={tz} hidePerks />
        <PublicChips value={o.public} label={t("publicLabel")} />
      </section>
      <section aria-labelledby="sponsorship-tiers" className="flex flex-col gap-3" data-testid="agency-tiers">
        <h2 id="sponsorship-tiers" className="text-base font-semibold text-fg">
          {t("tiersTitle")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {o.tiers.map((z) => (
            <li key={z.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-fg">{z.name}</span>
                <Badge size="sm" variant={z.agreed >= z.slots ? "accent" : "neutral"}>
                  {t("tierAgreed", { agreed: z.agreed, slots: z.slots })}
                </Badge>
              </span>
              {/* 0140: valor e modelo só quando a cota pede dinheiro */}
              {z.compensation.money ? (
                <>
                  <span className={tierMissingPrice(z) ? "type-body-sm text-warning" : "text-base font-semibold text-fg"}>
                    {canValues ? (z.priceCents !== null ? formatCents(z.priceCents, locale) : t("tierNoPrice")) : z.hasPrice ? t("tierPriceSet") : t("tierNoPriceManager")}
                  </span>
                  {/* 0108: modelo de valor da cota; no fixo, quanto já foi coberto e a parte de cada nova marca */}
                  <span className="type-caption text-fg-muted" data-testid="tier-model">
                    {tvm(`tierModel.${z.valueModel}`)}
                    {canValues && z.priceCents !== null
                      ? z.valueModel === "fixo"
                        ? ` · ${tvm("tierCovered", { covered: formatCents(z.coveredCents ?? 0, locale), total: formatCents(z.priceCents, locale) })}${z.askCents !== null ? ` · ${tvm("tierShare", { value: formatCents(z.askCents, locale) })}` : ""}`
                        : ` · ${tvm("tierTotal", { value: formatCents(tierTotalCents({ valueModel: z.valueModel, priceCents: z.priceCents, slots: z.slots }) ?? 0, locale) })}`
                      : ""}
                  </span>
                </>
              ) : null}
              {/* 0140: permuta e performance de cada marca (gestor vê sem números) */}
              <CompensationView compensation={z.compensation} canValues={canValues} />
              <ul className="flex list-disc flex-col gap-1 pl-5 type-body-sm text-fg">
                {z.perks.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="sponsorship-proposals" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="sponsorship-proposals" className="text-base font-semibold text-fg">
            {t("proposalsTitle")}
          </h2>
          <p className="type-caption text-fg-muted">{canValues ? t("proposalsHintAdmin") : t("proposalsHintManager")}</p>
        </div>
        <AgencyProposalsPanel proposals={o.proposals} tiers={o.tiers} canValues={canValues} timeZone={tz} />
      </section>
      {o.decidedAt ? (
        <p className="rounded-xl border border-border bg-surface px-3 py-2 type-body-sm text-fg-muted" data-testid="sponsorship-decided">
          {t("decidedBy", { name: o.decidedLabel || "—", date: formatDateTime(o.decidedAt, locale, tz) })}
          {o.decisionNote ? ` · “${o.decisionNote}”` : ""}
        </p>
      ) : null}
      <section aria-labelledby="sponsorship-brands" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="sponsorship-brands" className="text-base font-semibold text-fg">
            {t("brandsTitle")}
          </h2>
          <p className="type-caption text-fg-muted">
            {t("counts", counts)} · {t("brandsHint")}
          </p>
        </div>
        {o.brands.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("noBrands")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">{o.brands.map(brandLine)}</ul>
        )}
      </section>
      {canDecide(o) ? <SponsorshipDecide id={o.id} interested={interested.map((b) => ({ brandId: b.brandId, name: b.name }))} agreed={agreedBrands} /> : null}
      {o.status === "open" || o.status === "draft" ? (
        <details className="group flex flex-col gap-3" data-testid="sponsorship-edit" open={o.status === "draft"}>
          <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-accent-text">
            <Pencil className="size-4" aria-hidden="true" />
            {t("edit")}
          </summary>
          <div className="mt-3">
            <SponsorshipForm
              brands={brands.map((b) => ({ id: b.brand.id, name: b.brand.name }))}
              status={o.status === "draft" ? "draft" : "open"}
              heroLocked={responded}
              canValues={canValues}
              lockedTierIds={o.tiers.filter((z) => z.hasProposals).map((z) => z.id)}
              initial={{
                id: o.id,
                hero: choiceFromHeroInfo(o.hero),
                title: o.title,
                description: o.description,
                location: o.location,
                date: start.date,
                endDate: o.allDay ? (allDayEnd.date === start.date ? "" : allDayEnd.date) : end.date === start.date ? "" : end.date,
                startTime: o.allDay ? "09:00" : start.time,
                endTime: o.allDay ? "12:00" : end.time,
                allDay: o.allDay,
                expectedReach: o.expectedReach,
                tiers: o.tiers.map((z) => ({
                  id: z.id,
                  name: z.name,
                  priceText: centsToBrl(z.priceCents),
                  perksText: z.perks.join("\n"),
                  slots: z.slots,
                  valueModel: z.valueModel,
                  // 0140: a forma de pagamento gravada (gestor recebe sem números e só vê; o Adm edita)
                  compensation: draftFrom(z.compensation, centsToBrl),
                })),
                public: o.public ?? EMPTY_PUBLIC,
                networks: o.networks,
                respondDate: respond.date,
                respondTime: respond.time,
                audience: o.audience,
                brandIds: o.targetIds,
              }}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
