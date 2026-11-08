"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CompensationFields } from "@/components/compensation/CompensationFields";
import { Button, Checkbox, FormField, Input, MoneyInput, Textarea } from "@/components/ui";
import { MONEY_ONLY, draftFrom, draftToCompensation, type Compensation } from "@/lib/compensation/model";
import { parseBrlToCents } from "@/lib/deals/schemas";
import { brlToCents, centsToBrl } from "@/lib/money/brl-input";
import { EMPTY_PUBLIC, MAX_AMOUNT_CENTS, MAX_PERKS, composePerks, priceDiff, proposalPerksValid, publicIsEmpty, termsAmount, type SponsorshipPublic } from "@/lib/sponsorship/negotiation";
import { AudienceFields } from "./AudienceFields";
import { DiffText } from "./NegotiationView";

/** amountCents: null quando a forma de pagamento não tem dinheiro (0140: só permuta e/ou performance). */
export type ComposedTerms = { amountCents: number | null; compensation: Compensation; perks: string[]; note: string; public: SponsorshipPublic | null };

type Props = {
  /** contrapartidas de referência (da cota ou da última rodada): marcar/desmarcar */
  basePerks: string[];
  askedCents: number | null;
  initialCents: number | null;
  /** 0140: forma de pagamento de partida — a da cota (proposta da marca) ou a da proposta atual (contraproposta) */
  initialCompensation?: Compensation;
  /** a marca pode indicar o público que lhe interessa */
  withAudience: boolean;
  initialPublic?: SponsorshipPublic | null;
  submitLabel: string;
  pending: boolean;
  onSubmit: (terms: ComposedTerms) => void;
  onCancel: () => void;
};

// Proposta / contraproposta (0088): valor (MoneyInput) com a diferença em relação ao pedido (R$ e %), contrapartidas
// da cota para marcar/desmarcar, pedidos novos (ex.: "post no feed", "mais 2 stories"), mensagem e, para a marca,
// o "público que me interessa" (opcional, mesmos campos da campanha).
// 0140: forma de pagamento (Valor, Permuta, Performance, combináveis) já preenchida com a da cota ou da proposta; o
// valor só aparece (e só vai) com "Valor" marcado.
export function TermsComposer({ basePerks, askedCents, initialCents, initialCompensation = MONEY_ONLY, withAudience, initialPublic = null, submitLabel, pending, onSubmit, onCancel }: Props) {
  const t = useTranslations("sponsorship.negotiation.composer");
  const tc = useTranslations("compensation");
  const [amountText, setAmountText] = useState(centsToBrl(initialCents));
  const [comp, setComp] = useState(() => draftFrom(initialCompensation, centsToBrl));
  const [kept, setKept] = useState<string[]>(basePerks);
  const [extras, setExtras] = useState<string[]>([]);
  const [draftExtra, setDraftExtra] = useState("");
  const [note, setNote] = useState("");
  const [showPublic, setShowPublic] = useState(!publicIsEmpty(initialPublic));
  const [pub, setPub] = useState<SponsorshipPublic>(initialPublic ?? EMPTY_PUBLIC);
  const [error, setError] = useState<string | null>(null);
  const cents = parseBrlToCents(amountText);
  const diff = typeof cents === "number" ? priceDiff(askedCents, cents) : null;

  function addExtra() {
    const item = draftExtra.replace(/\s+/g, " ").trim();
    if (!item) return;
    setExtras((cur) => (cur.some((x) => x.toLowerCase() === item.toLowerCase()) ? cur : [...cur, item]));
    setDraftExtra("");
  }

  function submit() {
    setError(null);
    const checked = draftToCompensation(comp, brlToCents);
    if (!checked.ok) return setError(tc(`errors.${checked.error}`));
    const amount = termsAmount(checked.value.money, cents);
    if (amount === undefined) return setError(t("amountInvalid"));
    const perks = composePerks(basePerks, kept, draftExtra.trim() ? [...extras, draftExtra] : extras);
    if (!proposalPerksValid(perks)) return setError(t("perksInvalid", { max: MAX_PERKS }));
    onSubmit({ amountCents: amount, compensation: checked.value, perks, note: note.trim(), public: withAudience && showPublic && !publicIsEmpty(pub) ? pub : null });
  }

  // o valor proposto e a diferença em relação ao pedido: só com "Valor" marcado
  const moneyFields = (
    <>
      <FormField label={t("amount")} hint={askedCents === null ? t("amountHintNoAsk") : undefined} required>
        <MoneyInput value={amountText} maxCents={MAX_AMOUNT_CENTS} onValueChange={(text) => setAmountText(text)} disabled={pending} inputSize="lg" data-testid="composer-amount" />
      </FormField>
      {diff ? (
        <p className="-mt-2 flex items-center gap-2 type-caption text-fg-muted" data-testid="composer-diff">
          {diff.cents === 0 ? t("sameAsAsked") : <DiffText cents={diff.cents} pct={diff.pct} />}
        </p>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-4" data-testid="terms-composer">
      <CompensationFields idPrefix="composer" draft={comp} onChange={setComp} disabled={pending} money={moneyFields} hint={t("compHint")} />
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium text-fg">{t("perks")}</legend>
        {basePerks.map((p) => (
          <Checkbox key={p} label={p} checked={kept.includes(p)} onChange={(e) => setKept((cur) => (e.target.checked ? [...cur, p] : cur.filter((x) => x !== p)))} disabled={pending} />
        ))}
        {extras.map((p) => (
          <span key={p} className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-accent-soft px-3 type-body-sm text-fg">
            <span>+ {p}</span>
            <button type="button" className="inline-flex size-9 items-center justify-center rounded-md text-fg-muted hover:text-fg" aria-label={t("removeExtra", { item: p })} onClick={() => setExtras((cur) => cur.filter((x) => x !== p))} disabled={pending}>
              <X className="size-4" aria-hidden="true" />
            </button>
          </span>
        ))}
        <div className="mt-1 flex gap-2">
          <Input
            value={draftExtra}
            maxLength={120}
            placeholder={t("extraPlaceholder")}
            onChange={(e) => setDraftExtra(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addExtra();
              }
            }}
            disabled={pending}
            aria-label={t("extra")}
          />
          <Button type="button" variant="secondary" leadingIcon={<Plus />} onClick={addExtra} disabled={pending || !draftExtra.trim()}>
            {t("add")}
          </Button>
        </div>
      </fieldset>
      <FormField label={t("note")}>
        <Textarea value={note} maxLength={500} rows={2} placeholder={t("notePlaceholder")} onChange={(e) => setNote(e.target.value)} disabled={pending} />
      </FormField>
      {withAudience ? (
        <div className="flex flex-col gap-2">
          <Checkbox label={t("audienceToggle")} checked={showPublic} onChange={(e) => setShowPublic(e.target.checked)} disabled={pending} />
          {showPublic ? <AudienceFields idPrefix="composer" value={pub} onChange={setPub} disabled={pending} /> : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" size="lg" onClick={onCancel} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="button" size="lg" onClick={submit} loading={pending} data-testid="composer-submit">
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
