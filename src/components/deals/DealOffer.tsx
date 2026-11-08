"use client";

import { Building2, Check, Handshake, MessageSquareReply, Store, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { CompensationFields } from "@/components/compensation/CompensationFields";
import { CompensationView } from "@/components/compensation/CompensationView";
import { Button, DateRangePicker, Dialog, FormField, Textarea, useToast } from "@/components/ui";
import { ValueModelFields } from "@/components/value-model/ValueModelFields";
import { ValueTermsView } from "@/components/value-model/ValueTermsView";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { draftFrom, draftToCompensation, isMoneyOnly, MONEY_ONLY, toDb, type CompensationDb, type CompensationDraft } from "@/lib/compensation/model";
import { canAcceptOffer, offerStatus, termsOnTable, type OfferAction, type OfferTerms, type OfferView } from "@/lib/deals/offer";
import { agencyOfferReplyAction, brandOfferReplyAction } from "@/lib/deals/offer-actions";
import { brlToCents, centsToBrl } from "@/lib/money/brl-input";
import type { ValueModel } from "@/lib/value-model/model";

// Proposta da marca no negócio (0106), igual nos dois portais: situação, termos na mesa, botões grandes (Adm da
// agência: aceitar/contrapropor; dono da marca: aceitar/contrapropor/recusar) e o histórico das rodadas.
// Gestor e colaborador (sem valores) veem a linha de situação e, se houver permuta/performance, a forma de pagamento
// sem números. 0140: a contraproposta escolhe a forma de pagamento (Valor, Permuta, Performance); sem "Valor", sem
// campos de dinheiro, e a agência pode aceitar uma proposta só de permuta/performance.

type Props = { portal: "agency" | "brand"; dealId: string; requestId: string | null; view: OfferView };

type CounterDraft = { amountText: string; valueModel: ValueModel; maxHeroes: number | null; periodStart: string; periodEnd: string; note: string; comp: CompensationDraft };

function periodText(t: Pick<OfferTerms, "periodStart" | "periodEnd">, locale: Locale, empty: string): string {
  if (!t.periodStart) return empty;
  const a = formatPlainDate(t.periodStart, locale);
  return t.periodEnd && t.periodEnd !== t.periodStart ? `${a} – ${formatPlainDate(t.periodEnd, locale)}` : a;
}

/** Contraproposta começa dos termos na mesa (os da marca para a agência; a última da agência para a marca). */
function counterDraftFrom(base: OfferTerms | null): CounterDraft {
  const money = base?.compensation.money ?? true;
  return {
    amountText: money ? centsToBrl(base?.amountCents ?? null) : "",
    valueModel: money ? (base?.valueModel ?? "fixo") : "fixo",
    maxHeroes: money && base?.valueModel === "por_heroi" ? (base.maxHeroes ?? null) : null,
    periodStart: base?.periodStart ?? "",
    periodEnd: base?.periodEnd ?? "",
    note: "",
    comp: draftFrom(base?.compensation ?? MONEY_ONLY, centsToBrl),
  };
}

function TermsBlock({ terms, caption }: { terms: OfferTerms; caption?: string }) {
  const t = useTranslations("dealOffer.terms");
  const tc = useTranslations("compensation");
  const locale = useLocale() as Locale;
  const c = terms.compensation;
  const moneyOnly = isMoneyOnly(c);
  return (
    <dl className="grid gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-2" data-testid="deal-offer-terms">
      {caption ? <p className="type-caption text-fg-muted sm:col-span-2">{caption}</p> : null}
      <div className="flex flex-col">
        <dt className="type-caption text-fg-muted">{moneyOnly ? t("value") : tc("label")}</dt>
        <dd className="flex flex-col gap-1.5">
          {/* 0140: sem "Valor" não há dinheiro na mesa: nada de "não informou valor", só a permuta/performance */}
          {c.money ? terms.amountCents !== null ? <ValueTermsView model={terms.valueModel} amountCents={terms.amountCents} maxHeroes={terms.maxHeroes} /> : <span className="text-sm text-fg-muted">{t("noValue")}</span> : null}
          {moneyOnly ? null : <CompensationView compensation={c} />}
        </dd>
      </div>
      <div className="flex flex-col">
        <dt className="type-caption text-fg-muted">{t("period")}</dt>
        <dd className="text-sm text-fg">{periodText(terms, locale, t("periodOpen"))}</dd>
      </div>
    </dl>
  );
}

export function DealOffer({ portal, dealId, requestId, view }: Props) {
  const t = useTranslations("dealOffer");
  const tcomp = useTranslations("compensation");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [dialog, setDialog] = useState<OfferAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const status = offerStatus(view);
  // termos na mesa: o acordo; na vez da agência, os da marca; na vez da marca, a contraproposta da agência
  const shown = termsOnTable(view);
  const [draft, setDraft] = useState<CounterDraft>(() => counterDraftFrom(null));

  const title = view.agreed ? t("agreedTitle") : portal === "agency" ? t("agencyTitle") : view.turn === "brand" ? t("brandCounterTitle") : t("brandTitle");
  const canAccept = canAcceptOffer(portal, view.brandTerms);
  const ownerOnly = portal === "brand" && view.values && !view.canReply && view.open && view.turn === "brand" && view.role !== "owner";

  function open(action: OfferAction) {
    setError(null);
    if (action === "counter") setDraft(counterDraftFrom(shown));
    else setDraft((d) => ({ ...d, note: "" }));
    setDialog(action);
  }

  function send(action: OfferAction) {
    setError(null);
    // 0140: a contraproposta leva SEMPRE a forma de pagamento (sem ela o banco entenderia "só valor")
    let compensation: CompensationDb | null = null;
    if (action === "counter") {
      const checked = draftToCompensation(draft.comp, brlToCents);
      if (!checked.ok) return setError(tcomp(`errors.${checked.error}`));
      compensation = toDb(checked.value);
    }
    const money = compensation?.money ?? false;
    start(async () => {
      const input = {
        dealId,
        requestId,
        action,
        amountCents: money ? brlToCents(draft.amountText) : null,
        valueModel: money ? draft.valueModel : ("fixo" as ValueModel),
        maxHeroes: money && draft.valueModel === "por_heroi" ? draft.maxHeroes : null,
        periodStart: action === "counter" ? draft.periodStart : "",
        periodEnd: action === "counter" ? draft.periodEnd : "",
        note: action === "accept" ? "" : draft.note,
        compensation,
      };
      const result = portal === "agency" ? await agencyOfferReplyAction(input) : await brandOfferReplyAction(input);
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setDialog(null);
    });
  }

  const footer = (action: OfferAction, label: string) => (
    <>
      <Button type="button" variant="secondary" onClick={() => setDialog(null)} disabled={pending}>
        {t("actions.back")}
      </Button>
      <Button type="button" variant={action === "decline" ? "danger" : "primary"} onClick={() => send(action)} loading={pending} data-testid={`deal-offer-${action}-run`}>
        {label}
      </Button>
    </>
  );
  const errorLine = error ? (
    <p role="alert" className="type-body-sm text-danger">
      {error}
    </p>
  ) : null;

  return (
    <section
      id="deal-offer"
      className={`flex scroll-mt-20 flex-col gap-4 rounded-2xl border p-4 sm:p-5 ${view.canReply ? "border-accent/50 bg-accent-soft/40" : view.agreed ? "border-success/30 bg-success-soft/30" : "border-border bg-surface"}`}
      aria-labelledby="deal-offer-title"
      data-testid="deal-offer"
      data-status={status}
    >
      <h2 id="deal-offer-title" className="flex items-center gap-2 text-base font-semibold text-fg">
        <Handshake className={`size-5 ${view.agreed ? "text-success" : "text-accent-text"}`} aria-hidden="true" />
        {title}
      </h2>
      <p role="status" className="text-sm font-medium text-fg" data-testid="deal-offer-status">
        {t(`status.${portal}.${status}`)}
      </p>
      {view.values && shown ? <TermsBlock terms={shown} caption={!view.agreed && view.turn === "agency" && portal === "agency" && view.brandTerms ? t(`terms.source.${view.brandTerms.source}`) : undefined} /> : null}
      {/* sem valores (gestor, equipe): a forma de pagamento sem números, quando não é só dinheiro */}
      {!view.values && shown && !isMoneyOnly(shown.compensation) ? <CompensationView compensation={shown.compensation} canValues={false} /> : null}
      {view.values && view.agreed && portal === "agency" && view.open ? <p className="type-body-sm text-fg-muted">{t("confirmNext")}</p> : null}
      {ownerOnly ? <p className="type-body-sm text-fg-muted">{t("ownerOnly")}</p> : null}

      {view.canReply ? (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Button type="button" size="lg" leadingIcon={<Check />} onClick={() => open("accept")} disabled={!canAccept} className="w-full sm:w-auto" data-testid="deal-offer-accept">
              {portal === "agency" ? t("actions.accept") : t("actions.acceptShort")}
            </Button>
            <Button type="button" size="lg" variant="secondary" leadingIcon={<MessageSquareReply />} onClick={() => open("counter")} className="w-full sm:w-auto" data-testid="deal-offer-counter">
              {portal === "agency" ? t("actions.counter") : t("actions.counterShort")}
            </Button>
            {portal === "brand" ? (
              <Button type="button" size="lg" variant="ghost" leadingIcon={<X />} onClick={() => open("decline")} className="w-full sm:w-auto" data-testid="deal-offer-decline">
                {t("actions.decline")}
              </Button>
            ) : null}
          </div>
          {!canAccept ? <p className="type-caption text-fg-muted">{t("noValueHint")}</p> : null}
        </div>
      ) : null}

      {view.values && view.rounds.length > 0 ? (
        <details className="group" open={view.rounds.length <= 3}>
          <summary className="cursor-pointer text-sm font-medium text-fg">{t("history.title")}</summary>
          <ol className="mt-3 flex flex-col gap-3 border-l-2 border-border pl-4" data-testid="deal-offer-history">
            {view.rounds.map((r) => {
              const SideIcon = r.side === "agency" ? Building2 : Store;
              const cash = r.compensation.money && r.amountCents !== null;
              return (
                <li key={r.id} className="relative flex flex-col gap-1" data-action={r.action} data-side={r.side}>
                  <span className="absolute -left-[1.42rem] top-1 flex size-5 items-center justify-center rounded-full border border-border bg-surface">
                    <SideIcon className="size-3 text-accent-text" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-fg">
                    {t(`history.${r.side}`)} · {t(`history.action.${r.action}`)}
                  </span>
                  <span className="type-caption text-fg-muted">
                    {r.actorLabel ? `${r.actorLabel} · ` : ""}
                    {formatDateTime(r.createdAt, locale)}
                  </span>
                  {r.action !== "decline" && (cash || r.periodStart) ? (
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      {cash ? <ValueTermsView model={r.valueModel} amountCents={r.amountCents} maxHeroes={r.maxHeroes} className="flex flex-col" /> : null}
                      {r.periodStart ? <span className="type-caption text-fg-muted">{periodText(r, locale, "")}</span> : null}
                    </span>
                  ) : null}
                  {r.action !== "decline" && !isMoneyOnly(r.compensation) ? <CompensationView compensation={r.compensation} /> : null}
                  {r.note ? <p className="whitespace-pre-wrap type-body-sm text-fg">“{r.note}”</p> : null}
                </li>
              );
            })}
          </ol>
        </details>
      ) : null}

      <Dialog
        open={dialog === "accept"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t("acceptDialog.title")}
        description={shown && !shown.compensation.money ? t("acceptDialog.hintNoMoney") : t("acceptDialog.hint")}
        footer={footer("accept", t("actions.acceptShort"))}
      >
        <div className="flex flex-col gap-3">
          {shown ? <TermsBlock terms={shown} /> : null}
          {errorLine}
        </div>
      </Dialog>
      <Dialog open={dialog === "counter"} onOpenChange={(o) => !o && setDialog(null)} title={t("counterDialog.title")} description={t("counterDialog.hint")} footer={footer("counter", t("actions.send"))}>
        <div className="flex flex-col gap-3">
          {/* 0140: Valor (os campos de dinheiro de sempre), Permuta e/ou Performance; o valor só é pedido com "Valor" marcado */}
          <CompensationFields
            idPrefix="deal-offer"
            draft={draft.comp}
            onChange={(comp) => setDraft((d) => ({ ...d, comp }))}
            disabled={pending}
            money={
              <ValueModelFields
                idPrefix="deal-offer"
                model={draft.valueModel}
                onModelChange={(m) => setDraft((d) => ({ ...d, valueModel: m, maxHeroes: m === "por_heroi" ? (d.maxHeroes ?? 3) : null }))}
                amountText={draft.amountText}
                onAmountChange={(text) => setDraft((d) => ({ ...d, amountText: text }))}
                maxHeroes={draft.maxHeroes}
                onMaxHeroesChange={(n) => setDraft((d) => ({ ...d, maxHeroes: n }))}
                disabled={pending}
                required
              />
            }
          />
          <FormField label={t("terms.period")} hint={t("counterDialog.periodHint")}>
            <DateRangePicker start={draft.periodStart} end={draft.periodEnd} onChange={(a, b) => setDraft((d) => ({ ...d, periodStart: a, periodEnd: b }))} disabled={pending} data-testid="deal-offer-period" />
          </FormField>
          <FormField label={t("counterDialog.note")}>
            <Textarea value={draft.note} maxLength={500} rows={3} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} disabled={pending} />
          </FormField>
          {errorLine}
        </div>
      </Dialog>
      {portal === "brand" ? (
        <Dialog open={dialog === "decline"} onOpenChange={(o) => !o && setDialog(null)} title={t("declineDialog.title")} description={t("declineDialog.hint")} footer={footer("decline", t("actions.decline"))}>
          <div className="flex flex-col gap-3">
            <FormField label={t("declineDialog.reason")}>
              <Textarea value={draft.note} maxLength={500} rows={3} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} disabled={pending} />
            </FormField>
            {errorLine}
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
