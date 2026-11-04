"use client";

import { Ban, CheckCircle2, ExternalLink, MessageSquareReply, Trophy, Undo2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ProposalBadgeView } from "@/components/sponsorship/NegotiationView";
import { Avatar, Badge, Button, Checkbox, Dialog, EmptyState, FormField, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatNumber, formatPlainDate } from "@/i18n/format";
import { brandCallReplyAction, brandCallRoundReviewAction, decideBrandCallAction } from "@/lib/brand-call/actions";
import {
  brandCallActions,
  callProposalBadge,
  canPickWinner,
  compareFlags,
  deliverablesCount,
  sumReach,
  type BrandCallDetail,
  type CallProposal,
} from "@/lib/brand-call/logic";
import { ValueTermsView } from "@/components/value-model/ValueTermsView";
import { formatCents } from "@/lib/deals/schemas";
import { ceilingCents, validateTerms } from "@/lib/value-model/model";
import { brlToCents, centsToBrl } from "@/lib/money/brl-input";
import { priceDiff } from "@/lib/sponsorship/negotiation";
import { useGroupsError } from "@/components/deals/DeliverableGroupsEditor";
import { expandDeliverableGroups, groupDeliverables } from "@/lib/deals/deliverable-groups";
import { CallTimeline, DeliverablesText, TermsFields, type TermsDraft } from "./shared";

type Props = { detail: BrandCallDetail };

// Propostas recebidas (0089), lado a lado no celular (rolagem horizontal com encaixe): agência, creators (cartão
// autorizado, seguidores e link do media kit), alcance somado, entregas, valor (com a diferença em relação à verba),
// prazo e observações; destaques de menor valor, maior alcance e custo por mil seguidores. Cada proposta abre a
// negociação (aceitar, contrapropor, recusar; a equipe vai para o dono). O dono escolhe 1+ vencedoras → acordos e
// campanhas; ou encerra sem contratar. A marca nunca vê rascunhos das agências.
export function BrandCallProposals({ detail }: Props) {
  const t = useTranslations("brandCall.compare");
  const td = useTranslations("brandCall.decide");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { toast } = useToast();
  const { call, role, proposals } = detail;
  const decided = call.decidedAt !== null;
  const canDecide = role === "owner" && !decided && (call.status === "open" || call.status === "closed");
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<"contract" | "close" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const visible = proposals.filter((p) => p.status !== "closed" || p.endReason === "decided");
  // 0096: o que se compara é o teto de investimento (por herói = valor × máximo de heróis); o acordo congela o que foi acordado
  const termsOf = (p: CallProposal) =>
    p.status === "agreed" && p.agreedValueModel
      ? { model: p.agreedValueModel, amountCents: p.agreedCents, maxHeroes: p.agreedMaxHeroes }
      : { model: p.valueModel, amountCents: p.amountCents, maxHeroes: p.maxHeroes };
  const rows = visible.map((p) => ({
    id: p.id,
    amountCents: ceilingCents(termsOf(p)),
    reach: sumReach(p.talents.map((x) => x.card)),
    creators: p.talents.length,
    pieces: deliverablesCount(p.agreedDeliverables ?? p.deliverables),
    deliverBy: p.agreedDeliverBy ?? p.deliverBy,
  }));
  const flags = compareFlags(rows.filter((r) => visible.find((p) => p.id === r.id)?.status !== "declined"));
  const agreedIds = proposals.filter((p) => p.status === "agreed").map((p) => p.id);

  function decide(action: "contract" | "close") {
    setError(null);
    const ids = Array.from(new Set([...picked, ...agreedIds]));
    if (action === "contract" && ids.length === 0) return setError(td("pickOne"));
    start(async () => {
      const result = await decideBrandCallAction({ id: call.id, action, proposalIds: action === "contract" ? ids : [], note });
      setConfirm(null);
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      router.refresh();
    });
  }

  if (visible.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-surface" data-testid="brand-call-proposals">
        <EmptyState icon={<MessageSquareReply />} title={t("empty")} description={call.status === "open" ? t("emptyHint") : undefined} size="sm" />
      </section>
    );
  }

  return (
    <section aria-labelledby="call-compare" className="flex flex-col gap-3" data-testid="brand-call-proposals">
      <div className="flex flex-col gap-0.5">
        <h2 id="call-compare" className="text-base font-semibold text-fg">
          {t("title", { count: visible.length })}
        </h2>
        <p className="type-caption text-fg-muted">{t("hint")}</p>
      </div>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-3" data-testid="compare-row">
        {visible.map((p) => {
          const row = rows.find((r) => r.id === p.id);
          const f = flags[p.id];
          const terms = termsOf(p);
          const amount = ceilingCents(terms);
          const callCeiling = ceilingCents({ model: call.valueModel, amountCents: call.budgetCents, maxHeroes: call.maxHeroes });
          const diff = callCeiling !== null && amount !== null ? priceDiff(callCeiling, amount) : null;
          return (
            <li key={p.id} className="flex w-[85%] shrink-0 snap-start flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:w-auto" data-testid="compare-card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-fg">{p.agencyName}</span>
                <ProposalBadgeView badge={callProposalBadge(p)} viewer="brand" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="type-caption text-fg-muted">{t("amount")}</span>
                <span className="text-lg font-semibold text-fg" data-testid="compare-amount">
                  {amount !== null ? <ValueTermsView model={terms.model} amountCents={terms.amountCents} maxHeroes={terms.maxHeroes} /> : "—"}
                </span>
                {diff && diff.cents !== 0 ? (
                  <span className={`type-caption font-medium ${diff.cents > 0 ? "text-warning" : "text-success"}`} data-testid="compare-diff">
                    {t(diff.cents > 0 ? "aboveBudget" : "belowBudget", { pct: formatNumber(Math.abs(diff.pct), locale, { maximumFractionDigits: 1 }), amount: formatCents(Math.abs(diff.cents), locale) })}
                  </span>
                ) : null}
                {p.status === "agreed" ? <span className="type-caption text-accent-text">{t("agreedFrozen")}</span> : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {f?.cheapest ? (
                  <Badge size="sm" variant="success">
                    {t("flagCheapest")}
                  </Badge>
                ) : null}
                {f?.widestReach ? (
                  <Badge size="sm" variant="info">
                    {t("flagReach")}
                  </Badge>
                ) : null}
                {f?.mostPieces ? (
                  <Badge size="sm" variant="accent">
                    {t("flagPieces")}
                  </Badge>
                ) : null}
              </div>
              <dl className="grid grid-cols-2 gap-2 type-body-sm">
                <div className="flex flex-col">
                  <dt className="type-caption text-fg-muted">{t("creators")}</dt>
                  <dd className="font-semibold text-fg">{row?.creators ?? 0}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="type-caption text-fg-muted">{t("reach")}</dt>
                  <dd className="font-semibold text-fg" data-testid="compare-reach">
                    {row?.reach ? formatNumber(row.reach, locale, { notation: "compact" }) : t("reachUnknown")}
                  </dd>
                </div>
                <div className="flex flex-col">
                  <dt className="type-caption text-fg-muted">{t("pieces")}</dt>
                  <dd className="font-semibold text-fg">{row?.pieces ?? 0}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="type-caption text-fg-muted">{t("deliverBy")}</dt>
                  <dd className="font-semibold text-fg">{row?.deliverBy ? formatPlainDate(row.deliverBy, locale) : "—"}</dd>
                </div>
                {f?.costPerThousand ? (
                  <div className="col-span-2 flex flex-col">
                    <dt className="type-caption text-fg-muted">{t("costPerThousand")}</dt>
                    <dd className="font-semibold text-fg">{formatCents(f.costPerThousand, locale)}</dd>
                  </div>
                ) : null}
              </dl>
              <DeliverablesText items={p.agreedDeliverables ?? p.deliverables} className="type-caption text-fg" />
              <ul className="flex flex-col gap-2" aria-label={t("creators")}>
                {p.talents.map((x) => {
                  const followers = sumReach([x.card]);
                  return (
                    <li key={x.talentId} className="flex items-center gap-2" data-testid="compare-creator">
                      <Avatar src={x.card.photoUrl} name={x.card.name} size="sm" alt="" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium text-fg">{x.card.name}</span>
                        <span className="type-caption text-fg-muted">
                          {followers ? t("followers", { count: formatNumber(followers, locale, { notation: "compact" }) }) : t("reachUnknown")}
                          {" · "}
                          <DeliverablesText items={x.deliverables} className="type-caption text-fg-muted" />
                        </span>
                      </span>
                      {x.mediaKitUrl ? (
                        <a href={x.mediaKitUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 type-caption font-medium text-accent-text underline-offset-2 hover:underline">
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                          {t("mediaKit")}
                        </a>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {p.note ? <p className="whitespace-pre-wrap type-body-sm text-fg-muted">“{p.note}”</p> : null}
              {p.requestId ? (
                <Link href={`/marca/campanhas/${p.requestId}`} className="type-body-sm font-medium text-accent-text underline-offset-2 hover:underline" data-testid="compare-campaign">
                  {t("openCampaign")}
                </Link>
              ) : null}
              {canDecide && canPickWinner(p) ? (
                <Checkbox
                  label={p.status === "agreed" ? t("winnerAgreed") : t("pickWinner")}
                  checked={p.status === "agreed" || picked.includes(p.id)}
                  disabled={pending || p.status === "agreed"}
                  onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)))}
                  data-testid="compare-pick"
                />
              ) : null}
              <ProposalNegotiation proposal={p} detail={detail} />
            </li>
          );
        })}
      </ul>
      {canDecide ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="brand-call-decide">
          <h3 className="text-sm font-semibold text-fg">{td("title")}</h3>
          <p className="type-caption text-fg-muted">{td("hint")}</p>
          <FormField label={td("note")}>
            <Textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} disabled={pending} />
          </FormField>
          {error ? (
            <p role="alert" className="type-body-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" size="lg" leadingIcon={<Trophy />} onClick={() => setConfirm("contract")} disabled={pending || (picked.length === 0 && agreedIds.length === 0)} data-testid="brand-call-contract">
              {td("contract", { count: Array.from(new Set([...picked, ...agreedIds])).length })}
            </Button>
            <Button type="button" size="lg" variant="secondary" leadingIcon={<XCircle />} onClick={() => setConfirm("close")} disabled={pending}>
              {agreedIds.length > 0 ? td("closeWithAgreed") : td("close")}
            </Button>
          </div>
        </div>
      ) : role === "staff" && !decided && call.status !== "draft" ? (
        <p className="type-caption text-fg-muted">{td("ownerOnly")}</p>
      ) : null}
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm === "contract" ? td("confirmContractTitle") : td("confirmCloseTitle")}
        description={confirm === "contract" ? td("confirmContract") : td("confirmClose")}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setConfirm(null)} disabled={pending}>
              {td("back")}
            </Button>
            <Button type="button" onClick={() => confirm && decide(confirm)} disabled={pending} data-testid="brand-call-confirm">
              {confirm === "contract" ? td("confirm") : td("close")}
            </Button>
          </div>
        }
      />
    </section>
  );
}

function initialTerms(p: CallProposal): TermsDraft {
  return { amountText: centsToBrl(p.amountCents), valueModel: p.valueModel, maxHeroes: p.maxHeroes, deliverables: groupDeliverables(p.deliverables), deliverBy: p.deliverBy ?? "", note: "" };
}

/** Negociação de uma proposta, do lado da marca: histórico e ações (equipe: aceitar/contrapropor vão para o dono). */
function ProposalNegotiation({ proposal: p, detail }: { proposal: CallProposal; detail: BrandCallDetail }) {
  const t = useTranslations("brandCall.negotiation");
  const tv = useTranslations("valueModel");
  const router = useRouter();
  const { toast } = useToast();
  const { role, call } = detail;
  const actions = brandCallActions(p, call.decidedAt !== null, true);
  const pendingRound = p.history.find((r) => r.state === "pending_owner") ?? null;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"counter" | "decline" | null>(null);
  const [terms, setTerms] = useState<TermsDraft>(() => initialTerms(p));
  const groupsError = useGroupsError();
  const [reviewNote, setReviewNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setMode(null);
      router.refresh();
    });
  }

  function reply(action: "accept" | "decline" | "counter") {
    const amountCents = action === "counter" ? brlToCents(terms.amountText) : null;
    if (action === "counter" && (amountCents === null || terms.deliverables.length === 0)) return setError(t("termsRequired"));
    const expanded = action === "counter" ? expandDeliverableGroups(terms.deliverables) : { ok: true as const, items: [] };
    if (!expanded.ok) return setError(groupsError(expanded, terms.deliverables));
    if (action === "counter") {
      const problem = validateTerms({ model: terms.valueModel, amountCents, maxHeroes: terms.maxHeroes });
      if (problem === "value_per_hero_required" || problem === "max_heroes_required") return setError(tv(`errors.${problem}`));
    }
    run(() =>
      brandCallReplyAction({ proposalId: p.id, action, amountCents, deliverables: expanded.items, deliverBy: terms.deliverBy || null, note: terms.note, valueModel: action === "counter" ? terms.valueModel : null, maxHeroes: action === "counter" ? terms.maxHeroes : null }),
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((x) => !x)} aria-expanded={open} className="self-start" data-testid="compare-negotiation-toggle">
        {open ? t("hideHistory") : t("showHistory", { count: p.history.length })}
      </Button>
      {open ? <CallTimeline rounds={p.history} viewer="brand" agencyName={p.agencyName} /> : null}
      {pendingRound && role === "owner" ? (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/30 bg-warning-soft p-3" data-testid="round-review">
          <p className="type-body-sm text-fg">{t("ownerReview", { name: pendingRound.actorLabel || "—" })}</p>
          <FormField label={t("reviewNote")}>
            <Textarea value={reviewNote} maxLength={500} rows={2} onChange={(e) => setReviewNote(e.target.value)} disabled={pending} />
          </FormField>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" size="md" leadingIcon={<CheckCircle2 />} onClick={() => run(() => brandCallRoundReviewAction({ roundId: pendingRound.id, decision: "approve", note: reviewNote }))} disabled={pending}>
              {t("approveRound")}
            </Button>
            <Button type="button" size="md" variant="secondary" leadingIcon={<Undo2 />} onClick={() => run(() => brandCallRoundReviewAction({ roundId: pendingRound.id, decision: "return", note: reviewNote }))} disabled={pending}>
              {t("returnRound")}
            </Button>
          </div>
        </div>
      ) : pendingRound ? (
        <p className="type-caption text-warning">{t("waitingOwner")}</p>
      ) : null}
      {actions.length > 0 ? (
        mode === "counter" ? (
          <div className="flex flex-col gap-3" data-testid="brand-counter">
            <TermsFields idPrefix={`counter-${p.id}`} value={terms} onChange={setTerms} disabled={pending} />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" size="md" leadingIcon={<MessageSquareReply />} onClick={() => reply("counter")} disabled={pending} data-testid="brand-counter-send">
                {role === "owner" ? t("sendCounter") : t("sendToOwner")}
              </Button>
              <Button type="button" size="md" variant="ghost" onClick={() => setMode(null)} disabled={pending}>
                {t("back")}
              </Button>
            </div>
          </div>
        ) : mode === "decline" ? (
          <div className="flex flex-col gap-2">
            <FormField label={t("declineNote")}>
              <Textarea value={terms.note} maxLength={500} rows={2} onChange={(e) => setTerms({ ...terms, note: e.target.value })} disabled={pending} />
            </FormField>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" size="md" variant="danger" leadingIcon={<Ban />} onClick={() => reply("decline")} disabled={pending}>
                {t("confirmDecline")}
              </Button>
              <Button type="button" size="md" variant="ghost" onClick={() => setMode(null)} disabled={pending}>
                {t("back")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2" data-testid="brand-reply-actions">
            <Button type="button" size="md" leadingIcon={<CheckCircle2 />} onClick={() => reply("accept")} disabled={pending} data-testid="brand-accept">
              {role === "owner" ? t("accept") : t("acceptToOwner")}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" size="md" variant="secondary" onClick={() => setMode("counter")} disabled={pending} data-testid="brand-counter-open">
                {t("counter")}
              </Button>
              <Button type="button" size="md" variant="ghost" onClick={() => setMode("decline")} disabled={pending}>
                {t("decline")}
              </Button>
            </div>
          </div>
        )
      ) : null}
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
