"use client";

import { Handshake, MessageSquareReply, ThumbsDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, Dialog, FormField, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCents } from "@/lib/deals/schemas";
import { agencyReplyActions, proposalBadge } from "@/lib/sponsorship/negotiation";
import { agencyReplySponsorshipAction, type SponsorshipResult } from "@/lib/sponsorship/actions";
import type { AgencyTier, NegotiationProposal } from "@/lib/sponsorship/vocab";
import { MoneyWithDiff, NegotiationTimeline, ProposalBadgeView } from "./NegotiationView";
import { TermsComposer, type ComposedTerms } from "./TermsComposer";

type Props = { proposals: NegotiationProposal[]; tiers: AgencyTier[]; canValues: boolean; timeZone: string };

// Agência (0088): propostas por marca com a linha do tempo da negociação. Só o Adm vê valores e responde (aceitar,
// recusar com nota, contrapropor); gestor vê situação, contrapartidas e público indicado.
export function AgencyProposalsPanel({ proposals, tiers, canValues, timeZone }: Props) {
  const t = useTranslations("sponsorship.negotiation");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { toast } = useToast();
  const [composing, setComposing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "accept" | "decline"; proposal: NegotiationProposal } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(task: () => Promise<SponsorshipResult>) {
    setError(null);
    start(async () => {
      const result = await task();
      if (!result.ok) return setError(result.error);
      setComposing(null);
      setConfirm(null);
      setNote("");
      toast({ title: result.message, variant: "success" });
      router.refresh();
    });
  }

  const counter = (p: NegotiationProposal, terms: ComposedTerms) =>
    run(() => agencyReplySponsorshipAction({ proposalId: p.id, action: "counter", amountCents: terms.amountCents, perks: terms.perks, note: terms.note, public: null }));

  if (proposals.length === 0) return <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("agencyEmpty")}</p>;

  return (
    <div className="flex flex-col gap-3" data-testid="agency-proposals">
      {proposals.map((p) => {
        const state = { status: p.status, awaiting: p.awaiting, pendingOwner: false };
        const actions = agencyReplyActions(state, canValues);
        const tier = tiers.find((x) => x.id === p.tierId);
        const amount = p.status === "agreed" ? p.agreedCents : p.amountCents;
        const perks = p.status === "agreed" ? (p.agreedPerks ?? p.perks) : p.perks;
        const live = p.status === "open";
        return (
          <section key={p.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="agency-proposal" data-status={p.status}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-fg">{p.brandName}</span>
              <ProposalBadgeView badge={proposalBadge(state)} viewer="agency" />
              <span className="type-caption text-fg-muted">{t("tierLabel", { name: p.tierName })}</span>
            </div>
            {canValues && amount !== null ? <MoneyWithDiff cents={amount} askedCents={p.askedCents} size="lg" /> : null}
            {!canValues ? <p className="type-caption text-fg-muted">{t("valuesAdminOnly")}</p> : null}
            <ul className="flex list-disc flex-col gap-1 pl-6 type-body-sm text-fg">
              {perks.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            {p.endReason ? <p className="type-body-sm text-fg-muted">{t(`endReasonAgency.${p.endReason}`)}</p> : null}
            {p.status === "agreed" && p.requestId ? <p className="type-caption text-fg-muted">{t("agencyAgreedHint")}</p> : null}
            {live || p.history.length <= 2 ? (
              <NegotiationTimeline rounds={p.history} basePerks={tier?.perks ?? []} timeZone={timeZone} viewer="agency" brandName={p.brandName} />
            ) : (
              <details>
                <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-accent-text">{t("history", { count: p.history.length })}</summary>
                <NegotiationTimeline rounds={p.history} basePerks={tier?.perks ?? []} timeZone={timeZone} viewer="agency" brandName={p.brandName} />
              </details>
            )}
            {live && p.awaiting === "brand" ? <p className="type-body-sm text-fg-muted">{t("waitingBrandAgency")}</p> : null}
            {live && p.awaiting === "agency" && !canValues ? <p className="type-body-sm text-fg-muted">{t("adminAnswers")}</p> : null}
            {actions.length > 0 && composing !== p.id ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-testid="agency-reply-actions">
                <Button type="button" size="lg" leadingIcon={<Handshake />} onClick={() => setConfirm({ kind: "accept", proposal: p })} disabled={pending} data-testid="agency-accept">
                  {t("agencyAccept")}
                </Button>
                <Button type="button" size="lg" variant="secondary" leadingIcon={<MessageSquareReply />} onClick={() => setComposing(p.id)} disabled={pending} data-testid="agency-counter">
                  {t("counter")}
                </Button>
                <Button type="button" size="lg" variant="ghost" leadingIcon={<ThumbsDown />} onClick={() => setConfirm({ kind: "decline", proposal: p })} disabled={pending}>
                  {t("decline")}
                </Button>
              </div>
            ) : null}
            {composing === p.id ? (
              <TermsComposer
                basePerks={p.perks}
                askedCents={p.askedCents}
                initialCents={p.amountCents}
                withAudience={false}
                submitLabel={t("sendCounter")}
                pending={pending}
                onSubmit={(terms) => counter(p, terms)}
                onCancel={() => setComposing(null)}
              />
            ) : null}
            {composing === p.id && error ? (
              <p role="alert" className="type-body-sm text-danger">
                {error}
              </p>
            ) : null}
          </section>
        );
      })}
      <p className="type-caption text-fg-muted">{t("agencyPrivacy")}</p>
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
            setNote("");
          }
        }}
        title={confirm ? t(`confirm.agency_${confirm.kind}.title`) : ""}
        description={
          confirm?.kind === "accept" ? t("confirm.agency_accept.body", { brand: confirm.proposal.brandName, amount: formatCents(confirm.proposal.amountCents ?? 0, locale) }) : confirm ? t("confirm.agency_decline.body") : undefined
        }
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setConfirm(null)} disabled={pending}>
              {t("back")}
            </Button>
            <Button
              type="button"
              variant={confirm?.kind === "decline" ? "danger" : "primary"}
              loading={pending}
              onClick={() => confirm && run(() => agencyReplySponsorshipAction({ proposalId: confirm.proposal.id, action: confirm.kind, amountCents: null, perks: [], note: note.trim(), public: null }))}
            >
              {confirm ? t(`confirm.agency_${confirm.kind}.cta`) : ""}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <FormField label={confirm?.kind === "decline" ? t("declineNote") : t("noteOptional")} required={confirm?.kind === "decline"}>
            <Textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} disabled={pending} />
          </FormField>
          {error ? (
            <p role="alert" className="type-body-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
