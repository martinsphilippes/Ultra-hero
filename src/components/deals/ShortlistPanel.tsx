"use client";

import { Check, Minus, Plus, Send, ShieldAlert, UserMinus, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { consultTalentsAction, recordResponseAction, removeDealTalentAction, setFeeAction } from "@/app/agencia/negocios/actions";
import { InviteDialog } from "@/components/agency/InviteDialog";
import { ConflictAlert } from "@/components/offer/ConflictAlert";
import { CounterofferReview } from "@/components/offer/CounterofferReview";
import { Avatar, Badge, Button, Checkbox, Dialog, FormField, MoneyInput, Select, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { DealTalentRow } from "@/lib/deals/queries";
import { formatCents, parseBrlToCents } from "@/lib/deals/schemas";
import { centsToBrl } from "@/lib/money/brl-input";
import { isPreConfirmation, type DealStage } from "@/lib/deals/stages";
import { recoverFromStaleBuild } from "@/lib/stale-build";
import { CONSULT_DAYS, TALENT_RESPONSES, type TalentResponse } from "@/lib/deals/vocab";
import type { Conflict, Counteroffer } from "@/lib/offer/counteroffer";
import { CastBuilderButton } from "@/components/casting/CastBuilderDialog";
import { ValueTermsView } from "@/components/value-model/ValueTermsView";
import type { DealValueTerms } from "@/lib/deals/queries";
import { SuggestHeroesDialog, type Candidate } from "./SuggestHeroesDialog";
import { TalentStatusBadge } from "./StatusBadges";

export type { Candidate };

type Props = {
  dealId: string;
  stage: DealStage;
  rows: DealTalentRow[];
  candidates: Candidate[];
  /** Cachês (só chegam para o Adm). */
  fees: Record<string, number>;
  canEdit: boolean;
  isAdmin: boolean;
  documents: { id: string; title: string }[];
  /** Exclusividade vigente por talento (0079): alerta, não bloqueia; consultar exige confirmação. */
  conflicts?: Record<string, Conflict[]>;
  /** Contrapropostas por creator do negócio (valor só chega para o Adm). */
  counteroffers?: Record<string, Counteroffer[]>;
  canDecideFee?: boolean;
  canDecideDate?: boolean;
  /** Gestor+ fora da agência de exemplo: pode convidar o creator sem login (0087). */
  canInvite?: boolean;
  /** 0096: modelo de valor do negócio e se o chamador monta elenco (gestor+). */
  valueTerms?: DealValueTerms | null;
  canCast?: boolean;
};

// Elenco do negócio: sugeridos com os critérios atendidos, consulta de interesse (só com cachê definido),
// resposta do creator (pelo escritório) ou registrada pela agência (talento sem login), cachê (só Adm) e
// remoção. O cachê é a única coisa com valor nesta tela e só aparece para quem o banco devolve.
export function ShortlistPanel({ dealId, stage, rows, candidates, fees, canEdit, isAdmin, documents, conflicts = {}, counteroffers = {}, canDecideFee = false, canDecideDate = false, canInvite = false, valueTerms = null, canCast = false }: Props) {
  const t = useTranslations("agency.deal.talents");
  const tv = useTranslations("valueModel");
  const tr = useTranslations("commercial.reasons");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [consulting, setConsulting] = useState(false);
  const [recording, setRecording] = useState<DealTalentRow | null>(null);
  const [feeFor, setFeeFor] = useState<DealTalentRow | null>(null);
  const open = isPreConfirmation(stage);
  const active = rows.filter((r) => !["declined", "removed"].includes(r.status));
  const consultable = active.filter((r) => ["suggested", "declined"].includes(r.status) || r.status === "suggested");

  function toggle(id: string, on: boolean) {
    setPicked((cur) => (on ? Array.from(new Set([...cur, id])) : cur.filter((x) => x !== id)));
  }

  function remove(row: DealTalentRow) {
    if (!window.confirm(t("confirmRemove", { name: row.talent.name }))) return;
    start(async () => {
      const result = await removeDealTalentAction({ dealId, dealTalentId: row.id });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="shortlist-panel">
      {valueTerms && (valueTerms.hasValue || valueTerms.valueModel === "por_heroi") ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" aria-labelledby="deal-value-terms" data-testid="deal-value-terms">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 id="deal-value-terms" className="text-sm font-semibold text-fg">
                {tv("view.title")}
              </h2>
              <ValueTermsView model={valueTerms.valueModel} amountCents={valueTerms.valueCents} maxHeroes={valueTerms.maxHeroes} canValues={isAdmin} />
            </div>
            {valueTerms.valueModel === "por_heroi" && valueTerms.maxHeroes !== null ? (
              <Badge size="sm" variant={valueTerms.activeHeroes >= valueTerms.maxHeroes ? "warning" : "neutral"} data-testid="deal-value-slots">
                {tv("view.slots", { used: valueTerms.activeHeroes, max: valueTerms.maxHeroes })}
              </Badge>
            ) : null}
          </div>
          {canCast && canEdit && open && valueTerms.valueModel === "fixo" ? (
            <>
              <p className="type-caption text-fg-muted">{tv("cast.fixedHint")}</p>
              <CastBuilderButton dealId={dealId} currentIds={active.map((r) => r.talentId)} maxHeroes={null} budgetCents={valueTerms.valueCents} />
            </>
          ) : null}
        </section>
      ) : null}
      {rows.length === 0 ? <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("empty")}</p> : null}
      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const fee = fees[row.id];
          const selectable = canEdit && open && (row.status === "suggested" || row.status === "declined");
          return (
            <li key={row.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="deal-talent" data-status={row.status}>
              <div className="flex flex-wrap items-start gap-3">
                {selectable ? <Checkbox aria-label={t("select", { name: row.talent.name })} checked={picked.includes(row.id)} onChange={(e) => toggle(row.id, e.target.checked)} disabled={pending} /> : null}
                <Avatar src={row.talent.avatarUrl} name={row.talent.name} size="md" alt="" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-fg">{row.talent.name}</span>
                    <TalentStatusBadge status={row.status} />
                    {!row.talent.hasLogin ? <Badge size="sm">{t("noLogin")}</Badge> : null}
                    {!row.talent.hasHero && !row.talent.hasLogin ? (
                      <Badge size="sm" variant="warning" data-testid="deal-talent-outside">
                        {t("outsidePlatform")}
                      </Badge>
                    ) : null}
                    {!row.talent.consentActive ? (
                      <Badge size="sm" variant="warning">
                        {t("noConsent")}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="type-caption text-fg-muted">{[row.talent.city, row.talent.state].filter(Boolean).join(" · ") || t("noLocation")}</span>
                  {row.reasons.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5" aria-label={t("reasonsLabel")}>
                      {row.reasons.map((r) => (
                        <li key={r.code}>
                          <Badge size="sm" variant={r.met ? "success" : "neutral"} icon={r.met ? <Check /> : <Minus />}>
                            {tr(r.code)}
                            {r.detail.length > 0 ? `: ${r.detail.join(", ")}` : ""}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {row.consultedAt ? (
                    <span className="type-caption text-fg-muted">
                      {t("consultedAt", { date: formatDateTime(row.consultedAt, locale) })}
                      {row.respondBy && !row.respondedAt ? ` · ${t("respondBy", { date: formatDateTime(row.respondBy, locale) })}` : ""}
                    </span>
                  ) : null}
                  {conflicts[row.talentId] && !["removed", "declined"].includes(row.status) ? <ConflictAlert conflicts={conflicts[row.talentId] ?? []} side="agency" compact /> : null}
                  {counteroffers[row.id] ? <CounterofferReview dealId={dealId} dealTalentId={row.id} counteroffers={counteroffers[row.id] ?? []} canDecideFee={canDecideFee && canEdit} canDecideDate={canDecideDate && canEdit} /> : null}
                  {row.respondedAt ? (
                    <p className="type-body-sm text-fg">
                      {t(row.responseChannel === "agency_record" ? "answeredByAgency" : "answeredByCreator", { date: formatDateTime(row.respondedAt, locale) })}
                      {row.responseNote ? <span className="text-fg-muted"> — “{row.responseNote}”</span> : null}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {isAdmin ? (
                    <span className="font-mono text-sm font-semibold text-fg" data-testid="deal-fee">
                      {fee !== undefined ? formatCents(fee, locale) : <span className="font-sans font-normal text-warning">{t("feeMissing")}</span>}
                    </span>
                  ) : row.termsReady ? (
                    <Badge size="sm" variant="success">
                      {t("termsReady")}
                    </Badge>
                  ) : (
                    <Badge size="sm" variant="warning">
                      {t("termsPending")}
                    </Badge>
                  )}
                </div>
              </div>
              {canEdit && row.status !== "removed" ? (
                <div className="flex flex-wrap gap-2">
                  {isAdmin && open ? (
                    <Button type="button" size="sm" variant="secondary" leadingIcon={<Wallet />} onClick={() => setFeeFor(row)} disabled={pending}>
                      {t("setFee")}
                    </Button>
                  ) : null}
                  {!row.talent.hasLogin && ["consulted", "talk_requested"].includes(row.status) ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => setRecording(row)} disabled={pending}>
                      {t("recordResponse")}
                    </Button>
                  ) : null}
                  {canInvite && !row.talent.hasLogin ? (
                    <InviteDialog target={{ kind: "talent", talentId: row.talentId }} roles={[]} triggerLabel={t("inviteCreator")} triggerVariant="secondary" triggerTestId={`invite-open-${row.id}`} />
                  ) : null}
                  {row.status !== "contracted" && (row.status !== "proposed" || open) ? (
                    <Button type="button" size="sm" variant="ghost" leadingIcon={<UserMinus />} onClick={() => remove(row)} disabled={pending}>
                      {t("remove")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {canEdit && open ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" leadingIcon={<Plus />} onClick={() => setAdding(true)} disabled={pending} data-testid="shortlist-add">
            {t("add")}
          </Button>
          <Button type="button" size="sm" leadingIcon={<Send />} onClick={() => setConsulting(true)} disabled={pending || picked.length === 0} data-testid="consult-open">
            {t("consult", { count: picked.length })}
          </Button>
          {consultable.length > 0 && picked.length === 0 ? <span className="self-center type-caption text-fg-muted">{t("consultHint")}</span> : null}
        </div>
      ) : null}

      {adding ? <SuggestHeroesDialog dealId={dealId} candidates={candidates} conflicts={conflicts} onClose={() => setAdding(false)} current={rows.filter((r) => r.status !== "removed").map((r) => ({ talentId: r.talentId, reasons: r.reasons, keep: r.status !== "suggested" }))} /> : null}
      <ConsultDialog
        open={consulting}
        onOpenChange={setConsulting}
        dealId={dealId}
        dealTalentIds={picked}
        conflicted={rows.filter((r) => picked.includes(r.id) && (conflicts[r.talentId]?.length ?? 0) > 0).length}
        onDone={() => setPicked([])}
      />
      {recording ? <RecordResponseDialog row={recording} dealId={dealId} documents={documents} onClose={() => setRecording(null)} /> : null}
      {feeFor ? <FeeDialog row={feeFor} dealId={dealId} current={fees[feeFor.id]} onClose={() => setFeeFor(null)} /> : null}
    </div>
  );
}

function ConsultDialog({ open, onOpenChange, dealId, dealTalentIds, conflicted, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; dealId: string; dealTalentIds: string[]; conflicted: number; onDone: () => void }) {
  const t = useTranslations("agency.deal.consultDialog");
  const tx = useTranslations("offer.conflict");
  const te = useTranslations("errors");
  const [confirmConflicts, setConfirmConflicts] = useState(false);
  const { toast } = useToast();
  const [days, setDays] = useState<number>(7);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    setError(null);
    if (conflicted > 0 && !confirmConflicts) return setError(tx("consultConfirmRequired"));
    start(async () => {
      let result: Awaited<ReturnType<typeof consultTalentsAction>>;
      try {
        result = await consultTalentsAction({ dealId, dealTalentIds, days, message: message.trim(), confirmConflicts: conflicted > 0 && confirmConflicts });
      } catch (e) {
        // a action pode ter gravado no servidor (versão nova publicada com a aba aberta): recarrega em vez de
        // derrubar a tela no limite de erro; fora disso, mensagem genérica no próprio diálogo
        if (recoverFromStaleBuild(e)) return;
        return setError(te("generic.description"));
      }
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setMessage("");
      setConfirmConflicts(false);
      onDone();
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title", { count: dealTalentIds.length })}
      description={t("hint")}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("back")}
          </Button>
          <Button type="button" onClick={send} loading={pending} leadingIcon={<Send />} data-testid="consult-send">
            {t("send")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label={t("days")}>
          <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} disabled={pending}>
            {CONSULT_DAYS.map((d) => (
              <option key={d} value={d}>
                {t("daysOption", { count: d })}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("message")} hint={t("messageHint")}>
          <Textarea value={message} maxLength={2000} rows={4} onChange={(e) => setMessage(e.target.value)} disabled={pending} />
        </FormField>
        {conflicted > 0 ? (
          <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning-soft/40 px-3 py-2" data-testid="consult-conflict">
            <p className="flex items-start gap-1.5 type-body-sm text-fg">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              {tx("consultWarn", { count: conflicted })}
            </p>
            <Checkbox label={tx("consultConfirm")} checked={confirmConflicts} onChange={(e) => setConfirmConflicts(e.target.checked)} disabled={pending} data-testid="consult-conflict-confirm" />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function RecordResponseDialog({ row, dealId, documents, onClose }: { row: DealTalentRow; dealId: string; documents: { id: string; title: string }[]; onClose: () => void }) {
  const t = useTranslations("agency.deal.record");
  const tr = useTranslations("commercial.responses");
  const { toast } = useToast();
  const [response, setResponse] = useState<TalentResponse>("interested");
  const [note, setNote] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (note.trim().length < 5) return setError(t("noteRequired"));
    start(async () => {
      const result = await recordResponseAction({ dealId, dealTalentId: row.id, response, note: note.trim(), documentId: documentId || null });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)} title={t("title", { name: row.talent.name })} description={t("hint")}>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <FormField label={t("response")}>
          <Select value={response} onChange={(e) => setResponse(e.target.value as TalentResponse)} disabled={pending}>
            {TALENT_RESPONSES.map((r) => (
              <option key={r} value={r}>
                {tr(r)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("note")} hint={t("noteHint")} required>
          <Textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} disabled={pending} />
        </FormField>
        {documents.length > 0 ? (
          <FormField label={t("document")} hint={t("documentHint")}>
            <Select value={documentId} onChange={(e) => setDocumentId(e.target.value)} disabled={pending}>
              <option value="">—</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("back")}
          </Button>
          <Button type="submit" loading={pending}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function FeeDialog({ row, dealId, current, onClose }: { row: DealTalentRow; dealId: string; current: number | undefined; onClose: () => void }) {
  const t = useTranslations("agency.deal.fee");
  const { toast } = useToast();
  const [text, setText] = useState(current !== undefined ? centsToBrl(current) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const cents = parseBrlToCents(text);
    if (cents === null || cents === undefined) return setError(t("invalid"));
    start(async () => {
      const result = await setFeeAction({ dealId, dealTalentId: row.id, feeCents: cents });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)} title={t("title", { name: row.talent.name })} description={t("hint")} size="sm">
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <FormField label={t("amount")} hint={row.consultedAt ? t("changeAfterConsult") : undefined} required>
          <MoneyInput value={text} maxCents={10_000_000_000} onValueChange={(v) => setText(v)} disabled={pending} />
        </FormField>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("back")}
          </Button>
          <Button type="submit" loading={pending} data-testid="fee-save">
            {t("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
