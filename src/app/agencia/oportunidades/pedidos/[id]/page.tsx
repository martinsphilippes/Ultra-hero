import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgencyCallReply, AgencyProposalBuilder } from "@/components/brand-call/AgencyCallPanels";
import { CallSummary } from "@/components/brand-call/CallSummary";
import { CallStatusBadge, CallTimeline, DeliverablesText } from "@/components/brand-call/shared";
import { CompensationView } from "@/components/compensation/CompensationView";
import { ProposalBadgeView } from "@/components/sponsorship/NegotiationView";
import { ValueTermsView } from "@/components/value-model/ValueTermsView";
import { Badge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { requireAgency } from "@/lib/agency/server";
import { callProposalBadge, proposalTerms } from "@/lib/brand-call/logic";
import { getAgencyBrandCall } from "@/lib/brand-call/queries";
import { isMoneyOnly } from "@/lib/compensation/model";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandCall.meta");
  return { title: t("call") };
}

type Props = { params: Promise<{ id: string }> };

// Pedido de marca (0089), lado da agência (gestor+): a necessidade da marca, os Heros do casting que demonstraram
// interesse, a proposta (rascunho do gestor; o Adm põe a forma de pagamento e o valor e envia) e a negociação em
// rodadas (só o Adm responde). Só a própria proposta aparece; nunca as de outras agências nem quantas há.
// 0140: forma de pagamento (valor, permuta e/ou performance) na chamada, na proposta e nas rodadas; números só para o Adm.
export default async function AgencyBrandCallPage({ params }: Props) {
  const ctx = await requireAgency("manager");
  const { id } = await params;
  const [t, tc, locale, detail] = await Promise.all([
    getTranslations("brandCall.agency"),
    getTranslations("compensation"),
    getLocale() as Promise<Locale>,
    getAgencyBrandCall(id, ctx.agency.id),
  ]);
  if (!detail) notFound();
  const { call, canValues } = detail;
  const decided = call.decidedAt !== null;
  const draft = detail.proposals.find((p) => p.status === "draft") ?? null;
  const live = detail.proposals.find((p) => p.status === "open" || p.status === "agreed") ?? null;
  const past = detail.proposals.filter((p) => p !== draft && p !== live && p.sentAt);
  const canPropose = call.status === "open" && call.respondBy !== null && Date.parse(call.respondBy) >= Date.now() && !live;
  // termos que valem na proposta viva (o acordo congela); sem dinheiro, só permuta/performance
  const liveTerms = live ? proposalTerms(live) : null;
  return (
    <div className="flex flex-col gap-5" data-testid="agency-brand-call-page">
      <PageHeader
        title={call.title}
        backHref="/agencia/oportunidades?aba=pedidos"
        backLabel={t("title")}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <CallStatusBadge status={call.status} closedReason={call.closedReason} />
            <span className="text-fg-muted">{call.brandName}</span>
          </span>
        }
      />
      <p className="type-caption text-fg-muted">{t("privacy")}</p>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-3">
          <CallSummary call={call} budget={canValues ? "values" : "masked"} showBrand />
          <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4" data-testid="call-interests">
            <h2 className="text-sm font-semibold text-fg">{t("interestsTitle", { count: detail.interests.length })}</h2>
            {detail.interests.length === 0 ? <p className="type-body-sm text-fg-muted">{t("interestsEmpty")}</p> : null}
            <ul className="flex flex-col gap-2">
              {detail.interests.map((i) => (
                <li key={i.talentId} className="flex flex-col">
                  <span className="text-sm font-medium text-fg">{i.name}</span>
                  <span className="type-caption text-fg-muted">
                    {formatDateTime(i.createdAt, locale)}
                    {i.message ? ` · “${i.message}”` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <div className="flex flex-col gap-4">
          {live && liveTerms ? (
            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="agency-call-proposal">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-fg">{t("yourProposal")}</h2>
                <ProposalBadgeView badge={callProposalBadge({ ...live, pendingOwner: false })} viewer="agency" />
              </div>
              {live.status === "agreed" ? <p className="type-body-sm text-accent-text">{t("agreedHint")}</p> : null}
              <dl className="grid grid-cols-2 gap-2 type-body-sm">
                {!isMoneyOnly(liveTerms.compensation) ? (
                  <div className="col-span-2 flex flex-col gap-1" data-testid="agency-call-proposal-payment">
                    <dt className="type-caption text-fg-muted">{tc("label")}</dt>
                    <dd>
                      <CompensationView compensation={liveTerms.compensation} canValues={canValues} />
                    </dd>
                  </div>
                ) : null}
                {liveTerms.compensation.money ? (
                  <div className="flex flex-col">
                    <dt className="type-caption text-fg-muted">{t("amount")}</dt>
                    <dd className="font-semibold text-fg">
                      <ValueTermsView model={liveTerms.model} amountCents={canValues ? liveTerms.amountCents : null} maxHeroes={liveTerms.maxHeroes} canValues={canValues} />
                      {!canValues && liveTerms.model === "fixo" ? t("amountHidden") : null}
                    </dd>
                  </div>
                ) : null}
                <div className="flex flex-col">
                  <dt className="type-caption text-fg-muted">{t("deliverBy")}</dt>
                  <dd className="font-semibold text-fg">{(live.agreedDeliverBy ?? live.deliverBy) ? formatPlainDate((live.agreedDeliverBy ?? live.deliverBy) as string, locale) : "—"}</dd>
                </div>
              </dl>
              <DeliverablesText items={live.agreedDeliverables ?? live.deliverables} />
              <div className="flex flex-wrap gap-1.5">
                {live.talents.map((x) => (
                  <Badge key={x.talentId} size="sm" variant="neutral">
                    {x.card.name}
                  </Badge>
                ))}
              </div>
              <CallTimeline rounds={live.history} viewer="agency" brandName={call.brandName} canValues={canValues} />
              <AgencyCallReply proposal={live} decided={decided} canValues={canValues} />
            </section>
          ) : null}
          {canPropose ? (
            <AgencyProposalBuilder
              key={draft?.id ?? "new"}
              callId={call.id}
              callDeliverables={call.deliverables}
              candidates={detail.candidates}
              interests={detail.interests}
              draft={draft}
              canValues={canValues}
              callValueModel={call.valueModel}
              callMaxHeroes={call.maxHeroes}
              callCompensation={call.compensation}
            />
          ) : !live ? (
            <p className="rounded-xl border border-border bg-surface-hover px-3 py-2 type-body-sm text-fg" data-testid="agency-call-closed">
              {t("cannotPropose")}
            </p>
          ) : null}
          {past.length > 0 ? (
            <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
              <h2 className="text-sm font-semibold text-fg">{t("pastTitle")}</h2>
              {past.map((p) => (
                <div key={p.id} className="flex flex-col gap-2">
                  <ProposalBadgeView badge={callProposalBadge({ ...p, pendingOwner: false })} viewer="agency" />
                  <CallTimeline rounds={p.history} viewer="agency" brandName={call.brandName} canValues={canValues} />
                </div>
              ))}
            </section>
          ) : null}
          <p className="type-caption text-fg-muted">
            <Link href="/agencia/agenda" className="underline-offset-2 hover:underline">
              {t("inAgenda")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
