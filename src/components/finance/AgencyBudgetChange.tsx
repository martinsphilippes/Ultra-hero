"use client";

import { Check, Plus, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { DeliverablesEditor } from "@/components/brand-call/shared";
import { Button, Checkbox, DatePicker, Dialog, FormField, Input, MoneyInput, Select, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import type { RequestDeliverable } from "@/lib/deals/schemas";
import { isOpenChange, MAX_PERKS, NOTE_MIN, planProblem, type BudgetChange, type CreatorAction, type PlanDraft } from "@/lib/finance/budget-change";
import { decideBudgetChangeAction } from "@/lib/finance/change-actions";
import { brlToCents } from "@/lib/money/brl-input";
import { ChangeStatusBadge, ChangeTimeline, ChangeValues, PlanView } from "./BudgetChangeShared";

type Talent = { dealTalentId: string; name: string };
type Props = {
  dealId: string;
  canDecide: boolean;
  items: BudgetChange[];
  talents: Talent[];
  deliverables: RequestDeliverable[];
  periodStart: string | null;
  periodEnd: string | null;
};

// Pedido de alteração de verba, lado da agência (0090): só o Adm vê valores e decide — recusa (com nota; a verba
// antiga segue) ou "Aceitar e realinhar" (plano estruturado e, se quiser, outro valor). Gestor e colaborador do negócio
// veem só a situação e a linha do tempo. Na confirmação da marca, o que não é automático vira tarefa deste negócio.
export function AgencyBudgetChange({ dealId, canDecide, items, talents, deliverables, periodStart, periodEnd }: Props) {
  const t = useTranslations("payments.change");
  const open = items.find((c) => isOpenChange(c.status)) ?? null;
  const [dialog, setDialog] = useState<null | "decline" | "propose">(null);
  if (items.length === 0) return null;
  const last = open ?? items[0];
  return (
    <div className="flex flex-col gap-3" data-testid="agency-budget-change">
      <div className="flex flex-wrap items-center gap-2">
        <ChangeStatusBadge status={last.status} />
        {!canDecide ? <span className="type-caption text-fg-muted">{t("noValues")}</span> : null}
      </div>
      {last.values ? <ChangeValues change={last} showReserved={false} /> : null}
      {last.values?.plan ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <h4 className="text-sm font-semibold text-fg">{t("plan.title")}</h4>
          <PlanView plan={last.values.plan} />
        </div>
      ) : null}
      <ChangeTimeline change={last} />
      {canDecide && last.status === "open" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" leadingIcon={<Check />} onClick={() => setDialog("propose")} data-testid="budget-change-propose">
            {t("propose")}
          </Button>
          <Button type="button" variant="secondary" leadingIcon={<X />} onClick={() => setDialog("decline")} data-testid="budget-change-decline">
            {t("agencyDecline")}
          </Button>
        </div>
      ) : null}
      {items.length > 1 ? (
        <details className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium text-fg">{t("history", { count: items.length - 1 })}</summary>
          <ul className="mt-3 flex flex-col gap-3">
            {items
              .filter((c) => c !== last)
              .map((c) => (
                <li key={c.id} className="flex flex-col gap-2">
                  <ChangeStatusBadge status={c.status} />
                  <ChangeTimeline change={c} />
                </li>
              ))}
          </ul>
        </details>
      ) : null}
      {dialog === "decline" && open ? <DeclineDialog change={open} dealId={dealId} onClose={() => setDialog(null)} /> : null}
      {dialog === "propose" && open ? (
        <ProposeDialog change={open} dealId={dealId} talents={talents} deliverables={deliverables} periodStart={periodStart} periodEnd={periodEnd} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}

function DeclineDialog({ change, dealId, onClose }: { change: BudgetChange; dealId: string; onClose: () => void }) {
  const t = useTranslations("payments.change");
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function run() {
    setError(null);
    if (note.trim().length < NOTE_MIN) return setError(t("noteRequired"));
    start(async () => {
      const r = await decideBudgetChangeAction({ id: change.id, dealId, decision: "decline", note, counterCents: null, plan: null });
      if (!r.ok) return setError(r.error);
      toast({ title: r.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={t("dialogs.agencyDecline")}
      description={t("agencyDeclineHint")}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={run} loading={pending} data-testid="budget-change-decline-submit">
            {t("dialogs.agencyDeclineSubmit")}
          </Button>
        </>
      }
    >
      <FormField label={t("note")} error={error} required>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} disabled={pending} />
      </FormField>
    </Dialog>
  );
}

type ProposeProps = { change: BudgetChange; dealId: string; talents: Talent[]; deliverables: RequestDeliverable[]; periodStart: string | null; periodEnd: string | null; onClose: () => void };

function ProposeDialog({ change, dealId, talents, deliverables, periodStart, periodEnd, onClose }: ProposeProps) {
  const t = useTranslations("payments.change");
  const tp = useTranslations("payments.change.plan");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [counter, setCounter] = useState("");
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<PlanDraft>({
    creators: talents.map((x) => ({ dealTalentId: x.dealTalentId, name: x.name, action: "keep" as CreatorAction, note: "" })),
    changeDeliverables: false,
    deliverables,
    periodStart: "",
    periodEnd: "",
    scheduleNote: "",
    perksText: "",
    note: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const patch = (p: Partial<PlanDraft>) => setDraft((cur) => ({ ...cur, ...p }));
  const patchCreator = (i: number, p: Partial<PlanDraft["creators"][number]>) =>
    setDraft((cur) => ({ ...cur, creators: cur.creators.map((c, j) => (j === i ? { ...c, ...p } : c)) }));

  function run() {
    setError(null);
    const problem = planProblem(draft);
    if (problem) return setError(t(`planErrors.${problem}`));
    const counterCents = counter.trim() ? brlToCents(counter) : null;
    if (counter.trim() && counterCents === null) return setError(t("amountInvalid"));
    start(async () => {
      const r = await decideBudgetChangeAction({ id: change.id, dealId, decision: "propose", note, counterCents, plan: draft });
      if (!r.ok) return setError(r.error);
      toast({ title: r.message, variant: "success" });
      onClose();
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={t("dialogs.propose")}
      description={t("proposeHint")}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={run} loading={pending} data-testid="budget-change-propose-submit">
            {t("dialogs.proposeSubmit")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label={t("counter")} hint={t("counterHint")}>
          <MoneyInput value={counter} maxCents={10_000_000_000} onValueChange={(v) => setCounter(v)} disabled={pending} />
        </FormField>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-fg">{tp("creators")}</legend>
          <p className="type-caption text-fg-muted">{t("creatorsHint")}</p>
          <ul className="flex flex-col gap-2">
            {draft.creators.map((c, i) => (
              <li key={`${c.dealTalentId ?? "new"}-${i}`} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_9rem]">
                {c.dealTalentId ? (
                  <span className="self-center text-sm font-medium text-fg">{c.name}</span>
                ) : (
                  <FormField label={t("creatorName")}>
                    <Input value={c.name} onChange={(e) => patchCreator(i, { name: e.target.value })} maxLength={120} disabled={pending} />
                  </FormField>
                )}
                {c.dealTalentId ? (
                  <FormField label={t("creatorAction")}>
                    <Select value={c.action} onChange={(e) => patchCreator(i, { action: e.target.value as CreatorAction })} disabled={pending}>
                      <option value="keep">{tp("actions.keep")}</option>
                      <option value="remove">{tp("actions.remove")}</option>
                    </Select>
                  </FormField>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    leadingIcon={<Trash2 />}
                    className="self-end"
                    onClick={() => setDraft((cur) => ({ ...cur, creators: cur.creators.filter((_, j) => j !== i) }))}
                    disabled={pending}
                  >
                    {t("removeRow")}
                  </Button>
                )}
                <FormField label={t("creatorNote")} className="sm:col-span-2">
                  <Input value={c.note} onChange={(e) => patchCreator(i, { note: e.target.value })} maxLength={300} disabled={pending} />
                </FormField>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            leadingIcon={<Plus />}
            className="w-fit"
            onClick={() => setDraft((cur) => ({ ...cur, creators: [...cur.creators, { dealTalentId: null, name: "", action: "add", note: "" }] }))}
            disabled={pending || draft.creators.length >= 30}
          >
            {t("addCreator")}
          </Button>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-fg">{tp("deliverables")}</legend>
          <Checkbox label={t("changeDeliverables")} checked={draft.changeDeliverables} onChange={(e) => patch({ changeDeliverables: e.target.checked })} disabled={pending} />
          {draft.changeDeliverables ? <DeliverablesEditor value={draft.deliverables} onChange={(v) => patch({ deliverables: v })} disabled={pending} idPrefix="realign" /> : null}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-fg">{tp("period")}</legend>
          <p className="type-caption text-fg-muted">{t("periodHint", { start: periodStart ? formatPlainDate(periodStart, locale) : "—", end: periodEnd ? formatPlainDate(periodEnd, locale) : "—" })}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <FormField label={t("periodStart")}>
              <DatePicker value={draft.periodStart} onChange={(v) => patch({ periodStart: v })} disabled={pending} />
            </FormField>
            <FormField label={t("periodEnd")}>
              <DatePicker value={draft.periodEnd} onChange={(v) => patch({ periodEnd: v })} min={draft.periodStart || undefined} disabled={pending} />
            </FormField>
          </div>
          <FormField label={tp("schedule")} hint={t("scheduleHint")}>
            <Textarea value={draft.scheduleNote} onChange={(e) => patch({ scheduleNote: e.target.value })} rows={2} maxLength={500} disabled={pending} />
          </FormField>
        </fieldset>

        <FormField label={tp("perks")} hint={t("perksHint", { max: MAX_PERKS })}>
          <Textarea value={draft.perksText} onChange={(e) => patch({ perksText: e.target.value })} rows={3} disabled={pending} />
        </FormField>
        <FormField label={tp("note")}>
          <Textarea value={draft.note} onChange={(e) => patch({ note: e.target.value })} rows={2} maxLength={1000} disabled={pending} />
        </FormField>
        <FormField label={t("agencyNote")} hint={t("agencyNoteHint")}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} disabled={pending} />
        </FormField>
        {error ? (
          <p className="type-body-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
