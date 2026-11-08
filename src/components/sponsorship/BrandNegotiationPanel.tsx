"use client";

import { ArrowRight, CheckCircle2, Handshake, MessageSquareReply, Send, ThumbsDown, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { CompensationView } from "@/components/compensation/CompensationView";
import { Badge, Button, Dialog, FormField, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { isMoneyOnly, toDb } from "@/lib/compensation/model";
import { formatCents } from "@/lib/deals/schemas";
import { brandReplyActions, canAcceptAsked, canProposeOnTier, proposalBadge, type SponsorshipPublic } from "@/lib/sponsorship/negotiation";
import { brandReplySponsorshipAction, proposeSponsorshipAction, reviewSponsorshipRoundAction, type SponsorshipResult } from "@/lib/sponsorship/actions";
import { hasPendingOwner, proposalTerms, type BrandNegotiation, type NegotiationProposal, type SponsorshipTier } from "@/lib/sponsorship/vocab";
import { MoneyWithDiff, NegotiationTimeline, ProposalBadgeView } from "./NegotiationView";
import { TermsComposer, type ComposedTerms } from "./TermsComposer";

type Props = {
  opportunityId: string;
  timeZone: string;
  negotiation: BrandNegotiation;
  /** a pessoa tem papel na marca (dono ou equipe) */
  hasRole: boolean;
  eventPublic: SponsorshipPublic | null;
};

type Composer = { kind: "propose"; tier: SponsorshipTier } | { kind: "counter"; proposal: NegotiationProposal } | null;
type Confirm = { kind: "acceptAsked"; tier: SponsorshipTier } | { kind: "accept"; proposal: NegotiationProposal } | { kind: "decline"; proposal: NegotiationProposal } | { kind: "return"; roundId: string } | null;

// Marca (0088): cotas com o valor PEDIDO e as contrapartidas; "Aceitar pelo valor pedido" (acordo na hora) ou "Fazer
// contraproposta" (valor + contrapartidas ajustadas + mensagem + público que interessa). Depois, a negociação em
// rodadas com a agência: aceitar, recusar ou contrapropor. A equipe monta e o dono aprova (0081); recusar vai direto.
// 0140: cada cota diz como a marca paga (Valor, Permuta, Performance); cota sem dinheiro mostra a permuta/performance
// no lugar do valor (nunca "a combinar") e tem "Aceitar como está"; a proposta pode ser sem dinheiro.
export function BrandNegotiationPanel({ opportunityId, timeZone, negotiation, hasRole, eventPublic }: Props) {
  const t = useTranslations("sponsorship.negotiation");
  const tvm = useTranslations("sponsorship.tierValue");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { toast } = useToast();
  const [composer, setComposer] = useState<Composer>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const owner = negotiation.role === "owner";
  const agreed = negotiation.proposals.find((p) => p.status === "agreed") ?? null;
  const live = negotiation.proposals.find((p) => p.status === "draft" || p.status === "open") ?? null;
  const past = negotiation.proposals.filter((p) => p !== agreed && p !== live);
  const tierOf = (id: string) => negotiation.tiers.find((x) => x.id === id) ?? null;

  function run(task: () => Promise<SponsorshipResult>) {
    setError(null);
    start(async () => {
      const result = await task();
      if (!result.ok) return setError(result.error);
      setComposer(null);
      setConfirm(null);
      setNote("");
      toast({ title: result.message, variant: "success" });
      router.refresh();
    });
  }

  const send = (terms: ComposedTerms) => {
    if (!composer) return;
    const base = { amountCents: terms.amountCents, compensation: toDb(terms.compensation), perks: terms.perks, note: terms.note, public: terms.public };
    if (composer.kind === "propose") {
      run(() => proposeSponsorshipAction({ ...base, id: opportunityId, tierId: composer.tier.id, action: "propose" }));
    } else {
      run(() => brandReplySponsorshipAction({ ...base, proposalId: composer.proposal.id, action: "counter" }));
    }
  };

  const confirmRun = () => {
    if (!confirm) return;
    if (confirm.kind === "acceptAsked") run(() => proposeSponsorshipAction({ id: opportunityId, tierId: confirm.tier.id, action: "accept_asked", amountCents: null, perks: [], note: note.trim(), public: null }));
    else if (confirm.kind === "accept") run(() => brandReplySponsorshipAction({ proposalId: confirm.proposal.id, action: "accept", amountCents: null, perks: [], note: note.trim(), public: null }));
    else if (confirm.kind === "decline") run(() => brandReplySponsorshipAction({ proposalId: confirm.proposal.id, action: "decline", amountCents: null, perks: [], note: note.trim(), public: null }));
    else run(() => reviewSponsorshipRoundAction({ roundId: confirm.roundId, decision: "return", note: note.trim() }));
  };

  // 0140: aceitar uma cota sem dinheiro é "aceitar como está"; o diálogo mostra a permuta/performance do acordo
  const confirmKey = confirm?.kind === "acceptAsked" && !confirm.tier.compensation.money ? "acceptAsIs" : confirm?.kind;
  const confirmComp = confirm?.kind === "acceptAsked" ? confirm.tier.compensation : confirm?.kind === "accept" ? confirm.proposal.compensation : null;

  const card = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4";
  const errorLine = error ? (
    <p role="alert" className="type-body-sm text-danger">
      {error}
    </p>
  ) : null;

  const proposalCard = (p: NegotiationProposal, opened: boolean) => {
    const tier = tierOf(p.tierId);
    const pendingRound = p.history.find((r) => r.state === "pending_owner") ?? null;
    const state = { status: p.status, awaiting: p.awaiting, pendingOwner: hasPendingOwner(p) };
    const actions = brandReplyActions(state, hasRole);
    // vale o acordado (acordo fechado) ou o proposto agora; sem dinheiro, sem valor (0140)
    const { amountCents: amount, perks, compensation } = proposalTerms(p);
    return (
      <section key={p.id} className={card} data-testid="brand-proposal" data-status={p.status}>
        <div className="flex flex-wrap items-center gap-2">
          <ProposalBadgeView badge={proposalBadge(state)} viewer="brand" />
          <span className="text-sm font-semibold text-fg">{t("tierLabel", { name: p.tierName })}</span>
        </div>
        {amount !== null ? <MoneyWithDiff cents={amount} askedCents={p.askedCents} size="lg" /> : null}
        {p.askedCents !== null ? <span className="-mt-2 type-caption text-fg-muted">{t("askedWas", { amount: formatCents(p.askedCents, locale) })}</span> : null}
        <CompensationView compensation={compensation} />
        <ul className="flex list-disc flex-col gap-1 pl-6 type-body-sm text-fg">
          {perks.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {p.status === "agreed" ? (
          <div className="flex flex-col gap-2 rounded-xl border border-accent/30 bg-accent-soft p-3" data-testid="brand-agreed">
            <p className="flex items-center gap-2 text-sm font-semibold text-fg">
              <CheckCircle2 className="size-4 text-accent-text" aria-hidden="true" />
              {t("agreedTitle")}
            </p>
            <p className="type-body-sm text-fg">{compensation.money ? t("agreedHint") : t("agreedHintNoCash")}</p>
            {p.requestId ? (
              <Button asChild size="lg" trailingIcon={<ArrowRight />} className="self-start">
                <Link href={`/marca/campanhas/${p.requestId}`}>{t("openCampaign")}</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
        {p.endReason ? <p className="type-body-sm text-fg-muted">{t(`endReason.${p.endReason}`)}</p> : null}
        {opened || p.history.length <= 3 ? (
          <NegotiationTimeline rounds={p.history} basePerks={tier?.perks ?? []} timeZone={timeZone} viewer="brand" canValues />
        ) : (
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-accent-text">{t("history", { count: p.history.length })}</summary>
            <NegotiationTimeline rounds={p.history} basePerks={tier?.perks ?? []} timeZone={timeZone} viewer="brand" canValues />
          </details>
        )}
        {opened && pendingRound ? (
          owner ? (
            <div className="flex flex-col gap-2 rounded-xl border border-warning/40 p-3" data-testid="owner-review">
              <p className="type-body-sm text-fg">{t("ownerReviewHint", { name: pendingRound.actorLabel || "—" })}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" size="lg" leadingIcon={<Send />} onClick={() => run(() => reviewSponsorshipRoundAction({ roundId: pendingRound.id, decision: "approve", note: "" }))} loading={pending} data-testid="owner-approve">
                  {t("approveAndSend")}
                </Button>
                <Button type="button" size="lg" variant="secondary" leadingIcon={<Undo2 />} onClick={() => setConfirm({ kind: "return", roundId: pendingRound.id })} disabled={pending}>
                  {t("returnToTeam")}
                </Button>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-warning/40 px-3 py-2 type-body-sm text-fg">{t("waitingOwner")}</p>
          )
        ) : null}
        {opened && p.status === "open" && p.awaiting === "agency" && !pendingRound ? <p className="type-body-sm text-fg-muted">{t("waitingAgency")}</p> : null}
        {opened && actions.length > 0 && composer?.kind !== "counter" ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-testid="brand-reply-actions">
            <Button type="button" size="lg" leadingIcon={<Handshake />} onClick={() => setConfirm({ kind: "accept", proposal: p })} disabled={pending} data-testid="brand-accept">
              {owner ? t("acceptCounter") : t("acceptCounterStaff")}
            </Button>
            <Button type="button" size="lg" variant="secondary" leadingIcon={<MessageSquareReply />} onClick={() => setComposer({ kind: "counter", proposal: p })} disabled={pending} data-testid="brand-counter">
              {t("counter")}
            </Button>
            <Button type="button" size="lg" variant="ghost" leadingIcon={<ThumbsDown />} onClick={() => setConfirm({ kind: "decline", proposal: p })} disabled={pending}>
              {t("decline")}
            </Button>
          </div>
        ) : null}
        {opened && composer?.kind === "counter" && composer.proposal.id === p.id ? (
          <TermsComposer
            basePerks={p.perks}
            askedCents={p.askedCents}
            initialCents={p.amountCents}
            initialCompensation={p.compensation}
            withAudience
            initialPublic={[...p.history].reverse().find((r) => r.audience)?.audience ?? null}
            submitLabel={owner ? t("sendCounter") : t("sendToOwner")}
            pending={pending}
            onSubmit={send}
            onCancel={() => setComposer(null)}
          />
        ) : null}
        {opened ? errorLine : null}
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-4" data-testid="brand-negotiation">
      {agreed ? proposalCard(agreed, true) : null}
      {live ? proposalCard(live, true) : null}

      <section aria-labelledby="tiers-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="tiers-title" className="text-base font-semibold text-fg">
            {t("tiersTitle")}
          </h2>
          <p className="type-caption text-fg-muted">{t("tiersHint")}</p>
        </div>
        {negotiation.tiers.map((tier) => {
          const can = canProposeOnTier(tier, negotiation.canPropose, hasRole);
          const composing = composer?.kind === "propose" && composer.tier.id === tier.id;
          // 0140: sem dinheiro, a cota já pede algo (a permuta/performance): não é "a combinar"
          const cash = tier.compensation.money;
          const asks = !cash || tier.priceCents !== null;
          return (
            <article key={tier.id} className={card} data-testid="brand-tier" data-full={tier.full}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-fg">{tier.name}</h3>
                <span className="flex flex-wrap gap-1.5">
                  {tier.full ? (
                    <Badge size="sm" variant="neutral">
                      {t("tierFull")}
                    </Badge>
                  ) : tier.slots > 1 ? (
                    <Badge size="sm" variant="info">
                      {t("tierSlots", { count: tier.slots })}
                    </Badge>
                  ) : null}
                </span>
              </div>
              {cash ? (
                <p className={tier.priceCents !== null ? "text-xl font-semibold text-fg" : "text-base font-medium text-fg-muted"} data-testid="tier-price">
                  {tier.priceCents !== null ? formatCents(tier.priceCents, locale) : t("priceToCombine")}
                </p>
              ) : null}
              {/* 0108: valor fixo do evento (dividido entre as marcas) ou valor por marca */}
              {cash && tier.priceCents !== null ? (
                <p className="type-caption text-fg-muted" data-testid="tier-model" data-model={tier.valueModel}>
                  {tier.valueModel === "fixo" ? tvm("brandFixo", { value: formatCents(tier.priceCents, locale), n: tier.slots }) : tvm("brandPorMarca", { value: formatCents(tier.priceCents, locale), n: tier.slots })}
                  {tier.valueModel === "fixo" && tier.askCents !== null ? ` · ${tvm("brandShare", { value: formatCents(tier.askCents, locale) })}` : ""}
                </p>
              ) : null}
              {/* 0140: como a marca paga esta cota (permuta, performance), por marca */}
              <CompensationView compensation={tier.compensation} />
              {tier.perks.length > 0 ? (
                <ul className="flex list-disc flex-col gap-1 pl-6 type-body-sm text-fg">
                  {tier.perks.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              ) : null}
              {can && !composing ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  {canAcceptAsked(tier) ? (
                    <Button type="button" size="lg" leadingIcon={<Handshake />} onClick={() => setConfirm({ kind: "acceptAsked", tier })} disabled={pending} data-testid="tier-accept">
                      {cash ? t("acceptAsked") : t("acceptAsIs")}
                    </Button>
                  ) : null}
                  <Button type="button" size="lg" variant={asks ? "secondary" : "primary"} leadingIcon={<MessageSquareReply />} onClick={() => setComposer({ kind: "propose", tier })} disabled={pending} data-testid="tier-counter">
                    {asks ? t("makeCounter") : t("makeProposal")}
                  </Button>
                </div>
              ) : null}
              {composing ? (
                <TermsComposer
                  basePerks={tier.perks}
                  askedCents={tier.askCents}
                  initialCents={tier.askCents}
                  initialCompensation={tier.compensation}
                  withAudience
                  initialPublic={eventPublic}
                  submitLabel={owner ? t("sendProposal") : t("sendToOwner")}
                  pending={pending}
                  onSubmit={send}
                  onCancel={() => setComposer(null)}
                />
              ) : null}
              {composing ? errorLine : null}
            </article>
          );
        })}
        {!negotiation.canPropose && !live && !agreed ? <p className="type-caption text-fg-muted">{t("cannotPropose")}</p> : null}
        {!hasRole ? <p className="type-caption text-fg-muted">{t("readOnly")}</p> : null}
        {!owner && hasRole && negotiation.canPropose ? <p className="type-caption text-fg-muted">{t("staffHint")}</p> : null}
        {!composer && !live ? errorLine : null}
      </section>

      {past.length > 0 ? (
        <details className="flex flex-col gap-3" data-testid="brand-past-proposals">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent-text">{t("pastTitle", { count: past.length })}</summary>
          <div className="mt-2 flex flex-col gap-3">{past.map((p) => proposalCard(p, false))}</div>
        </details>
      ) : null}

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
            setNote("");
          }
        }}
        title={confirm ? t(`confirm.${confirmKey}.title`) : ""}
        description={
          confirm?.kind === "acceptAsked"
            ? confirm.tier.compensation.money
              ? t(owner ? "confirm.acceptAsked.body" : "confirm.acceptAsked.bodyStaff", { tier: confirm.tier.name, amount: formatCents(confirm.tier.askCents ?? 0, locale) })
              : t(owner ? "confirm.acceptAsIs.body" : "confirm.acceptAsIs.bodyStaff", { tier: confirm.tier.name })
            : confirm?.kind === "accept"
              ? confirm.proposal.amountCents !== null
                ? t(owner ? "confirm.accept.body" : "confirm.accept.bodyStaff", { amount: formatCents(confirm.proposal.amountCents, locale) })
                : t(owner ? "confirm.accept.bodyNoCash" : "confirm.accept.bodyNoCashStaff")
              : confirm
                ? t(`confirm.${confirm.kind}.body`)
                : undefined
        }
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setConfirm(null)} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" variant={confirm?.kind === "decline" ? "danger" : "primary"} onClick={confirmRun} loading={pending} data-testid="confirm-run">
              {confirm ? t(`confirm.${confirmKey}.cta`) : ""}
            </Button>
          </div>
        }
      >
        {confirm ? (
          <div className="flex flex-col gap-2">
            {/* 0140: o que fica combinado além do valor (permuta, performance) */}
            {confirmComp && !isMoneyOnly(confirmComp) ? <CompensationView compensation={confirmComp} className="rounded-xl border border-border p-3" /> : null}
            <FormField label={confirm.kind === "return" ? t("returnNote") : t("noteOptional")} required={confirm.kind === "return"}>
              <Textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} disabled={pending} />
            </FormField>
            {errorLine}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
