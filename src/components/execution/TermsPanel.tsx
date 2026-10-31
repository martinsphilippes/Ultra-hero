"use client";

import { CheckCircle2, FileSignature, Send, ShieldCheck, Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Badge, Button, Checkbox, Dialog, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { acceptTermsAction, confirmContractAction, recordAcceptanceAction, saveTermsAction, sendTermsAction, withdrawTermsAction } from "@/lib/execution/actions";
import type { Terms } from "@/lib/execution/queries";

type Portal = "agency" | "brand" | "office";
type Props = {
  portal: Portal;
  dealId: string;
  requestId?: string | null;
  dealTalentId?: string | null;
  stage: string;
  terms: Terms[];
  /** Agência: negócio aberto e pessoa com acesso a ele; termos (rascunho, envio, aceites, confirmação) são de gestor+. */
  canEdit?: boolean;
  isManager?: boolean;
  /** Agência: creators confirmados para registrar aceite recebido fora (só sem login). */
  talents?: { dealTalentId: string; name: string; hasLogin: boolean }[];
  /** Marca: só o dono aceita. */
  canAccept?: boolean;
};

const STATUS_VARIANT = { draft: "neutral", sent: "warning", accepted: "success", superseded: "neutral", withdrawn: "neutral" } as const;

// Termos demonstrativos: resumo de condições por versão, envio, aceites por parte e contratação confirmada.
// O aceite NÃO é assinatura eletrônica: fica registrado quem aceitou, quando e por onde (no app ou pela agência).
export function TermsPanel({ portal, dealId, requestId, dealTalentId, stage, terms, canEdit = false, isManager = false, talents = [], canAccept = false }: Props) {
  const t = useTranslations("commercial.terms");
  const ta = useTranslations("agency.terms");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const live = terms.find((x) => x.status === "sent" || x.status === "accepted") ?? null;
  const draft = terms.find((x) => x.status === "draft") ?? null;
  const history = terms.filter((x) => x !== live && x !== draft);
  const [recording, setRecording] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const canWrite = portal === "agency" && canEdit && isManager && ["approved", "contracting"].includes(stage);

  const myAccepted = live ? live.acceptances.some((a) => (portal === "brand" ? a.party === "brand" : a.party === "talent" && a.dealTalentId === dealTalentId)) : false;
  const pendingTalents = live ? talents.filter((x) => !live.acceptances.some((a) => a.party === "talent" && a.dealTalentId === x.dealTalentId)) : [];
  const brandAccepted = live ? live.acceptances.some((a) => a.party === "brand") : false;
  const canConfirm = portal === "agency" && isManager && live?.status === "sent" && brandAccepted && pendingTalents.length === 0 && talents.length > 0;

  function withdraw(id: string) {
    if (!window.confirm(ta("confirmWithdraw"))) return;
    start(async () => {
      const result = await withdrawTermsAction({ termsId: id, dealId });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }
  function send(id: string) {
    if (!window.confirm(ta("confirmSend"))) return;
    start(async () => {
      const result = await sendTermsAction({ termsId: id, dealId });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }
  function confirm() {
    start(async () => {
      const result = await confirmContractAction({ dealId });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
      setConfirming(false);
    });
  }

  const block = (x: Terms, label: string) => (
    <article key={x.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="terms-card" data-status={x.status}>
      <header className="flex flex-wrap items-center gap-2">
        <FileSignature className="size-4 text-fg-muted" aria-hidden="true" />
        <span className="text-sm font-semibold text-fg">{label}</span>
        <Badge size="sm" variant={STATUS_VARIANT[x.status]}>
          {t(`status.${x.status}`)}
        </Badge>
        {x.sentAt ? <span className="type-caption text-fg-muted">{t("sentAt", { date: formatDateTime(x.sentAt, locale) })}</span> : null}
        {x.validUntil ? <span className="type-caption text-fg-muted">{t("validUntil", { date: formatPlainDate(x.validUntil, locale) })}</span> : null}
      </header>
      <dl className="flex flex-col gap-2 text-sm text-fg">
        <div>
          <dt className="type-caption text-fg-muted">{t("summary")}</dt>
          <dd className="whitespace-pre-wrap">{x.summary || "—"}</dd>
        </div>
        {x.usageRights ? (
          <div>
            <dt className="type-caption text-fg-muted">{t("usageRights")}</dt>
            <dd className="whitespace-pre-wrap">{x.usageRights}</dd>
          </div>
        ) : null}
        {x.exclusivity ? (
          <div>
            <dt className="type-caption text-fg-muted">{t("exclusivity")}</dt>
            <dd className="whitespace-pre-wrap">{x.exclusivity}</dd>
          </div>
        ) : null}
      </dl>
      {x.status !== "draft" ? (
        <ul className="flex flex-col gap-1" aria-label={t("acceptances")}>
          {x.acceptances.length === 0 ? <li className="type-caption text-fg-muted">{t("noAcceptances")}</li> : null}
          {x.acceptances.map((a, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 type-caption text-fg">
              <ShieldCheck className="size-3.5 text-success" aria-hidden="true" />
              {a.party === "brand" ? t("brandAccepted") : t("talentAccepted", { name: a.talentName ?? "" })} · {formatDateTime(a.acceptedAt, locale)} · {t(`method.${a.method}`)}
            </li>
          ))}
          {portal === "agency" && x === live
            ? pendingTalents.map((p) => (
                <li key={p.dealTalentId} className="type-caption text-fg-muted">
                  {t("talentPending", { name: p.name })}
                </li>
              ))
            : null}
          {portal === "agency" && x === live && !brandAccepted ? <li className="type-caption text-fg-muted">{t("brandPending")}</li> : null}
        </ul>
      ) : null}
    </article>
  );

  return (
    <div className="flex flex-col gap-4" data-testid="terms-panel">
      <p className="rounded-xl border border-dashed border-border px-3 py-2 type-caption text-fg-muted">{t("disclaimer")}</p>
      {live ? block(live, t("version", { n: live.version })) : null}
      {portal !== "agency" && live?.status === "sent" && (portal === "office" || canAccept) ? (
        myAccepted ? (
          <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft/40 px-3 py-2 text-sm text-fg" data-testid="terms-accepted">
            <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
            {t("youAccepted")}
          </p>
        ) : (
          <Button type="button" leadingIcon={<ShieldCheck />} onClick={() => setAcceptOpen(true)} className="w-fit" data-testid="terms-accept">
            {t("accept")}
          </Button>
        )
      ) : null}
      {portal === "brand" && live?.status === "sent" && !canAccept && !myAccepted ? <p className="type-caption text-fg-muted">{t("ownerOnly")}</p> : null}
      {portal === "agency" ? (
        <>
          {draft ? block(draft, t("draftLabel", { n: draft.version })) : null}
          {canWrite ? <TermsForm dealId={dealId} initial={draft ?? live ?? null} draftId={draft?.id ?? null} /> : null}
          {canWrite && isManager && draft ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" leadingIcon={<Send />} onClick={() => send(draft.id)} loading={pending} data-testid="terms-send">
                {ta("send")}
              </Button>
              <Button type="button" size="sm" variant="ghost" leadingIcon={<Undo2 />} onClick={() => withdraw(draft.id)} disabled={pending}>
                {ta("withdraw")}
              </Button>
            </div>
          ) : null}
          {canWrite && isManager && live?.status === "sent" ? (
            <div className="flex flex-wrap gap-2">
              {pendingTalents.some((p) => !p.hasLogin) || !brandAccepted ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => setRecording(true)} disabled={pending}>
                  {ta("recordAcceptance")}
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="ghost" leadingIcon={<Undo2 />} onClick={() => withdraw(live.id)} disabled={pending}>
                {ta("withdraw")}
              </Button>
            </div>
          ) : null}
          {canConfirm ? (
            <section className="flex flex-col gap-2 rounded-2xl border border-success/30 bg-success-soft/30 p-4" data-testid="contract-confirm">
              <h3 className="text-sm font-semibold text-fg">{ta("confirmTitle")}</h3>
              <p className="type-body-sm text-fg-muted">{ta("confirmHint")}</p>
              <Button type="button" leadingIcon={<CheckCircle2 />} onClick={() => setConfirming(true)} className="w-fit" data-testid="contract-confirm-open">
                {ta("confirmAction")}
              </Button>
            </section>
          ) : null}
          {live?.status === "sent" && isManager && !canConfirm ? <p className="type-caption text-fg-muted">{ta("waitingAcceptances")}</p> : null}
        </>
      ) : null}
      {history.length > 0 ? (
        <details className="rounded-2xl border border-border bg-surface p-3">
          <summary className="cursor-pointer text-sm font-medium text-fg">{t("history", { count: history.length })}</summary>
          <div className="mt-3 flex flex-col gap-3">{history.map((x) => block(x, t("version", { n: x.version })))}</div>
        </details>
      ) : null}
      {acceptOpen && live ? <AcceptDialog portal={portal === "brand" ? "brand" : "office"} termsId={live.id} dealId={dealId} requestId={requestId} dealTalentId={dealTalentId} onClose={() => setAcceptOpen(false)} /> : null}
      {recording && live ? <RecordDialog termsId={live.id} dealId={dealId} brandPending={!brandAccepted} talents={pendingTalents.filter((p) => !p.hasLogin)} onClose={() => setRecording(false)} /> : null}
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={ta("confirmTitle")}
        description={ta("confirmDialogHint")}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              {ta("back")}
            </Button>
            <Button type="button" onClick={confirm} loading={pending} data-testid="contract-confirm-run">
              {ta("confirmAction")}
            </Button>
          </>
        }
      />
    </div>
  );
}

function TermsForm({ dealId, initial, draftId }: { dealId: string; initial: Terms | null; draftId: string | null }) {
  const ta = useTranslations("agency.terms");
  const { toast } = useToast();
  const [v, setV] = useState({ summary: initial?.summary ?? "", usageRights: initial?.usageRights ?? "", exclusivity: initial?.exclusivity ?? "", validUntil: initial?.validUntil ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (v.summary.trim().length < 20) return setError(ta("summaryShort"));
    start(async () => {
      const result = await saveTermsAction({ dealId, ...v });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
    });
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" noValidate data-testid="terms-form">
      <h3 className="text-sm font-semibold text-fg">{draftId ? ta("editDraft") : initial ? ta("newVersion") : ta("newTerms")}</h3>
      <FormField label={ta("summary")} hint={ta("summaryHint")} required>
        <Textarea value={v.summary} maxLength={4000} rows={5} onChange={(e) => setV({ ...v, summary: e.target.value })} disabled={pending} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={ta("usageRights")}>
          <Textarea value={v.usageRights} maxLength={1000} rows={2} onChange={(e) => setV({ ...v, usageRights: e.target.value })} disabled={pending} />
        </FormField>
        <FormField label={ta("exclusivity")}>
          <Textarea value={v.exclusivity} maxLength={1000} rows={2} onChange={(e) => setV({ ...v, exclusivity: e.target.value })} disabled={pending} />
        </FormField>
      </div>
      <FormField label={ta("validUntil")} hint={ta("validUntilHint")}>
        <Input type="date" value={v.validUntil} onChange={(e) => setV({ ...v, validUntil: e.target.value })} disabled={pending} className="sm:max-w-xs" />
      </FormField>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" variant="secondary" loading={pending} className="w-fit" data-testid="terms-save">
        {ta("saveDraft")}
      </Button>
    </form>
  );
}

function AcceptDialog({ portal, termsId, dealId, requestId, dealTalentId, onClose }: { portal: "brand" | "office"; termsId: string; dealId: string; requestId?: string | null; dealTalentId?: string | null; onClose: () => void }) {
  const t = useTranslations("commercial.terms");
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function run() {
    setError(null);
    if (!agree) return setError(t("agreeRequired"));
    start(async () => {
      const result = await acceptTermsAction(portal, { termsId, note: note.trim(), dealId, requestId, dealTalentId });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={t("acceptTitle")}
      description={t("acceptHint")}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("back")}
          </Button>
          <Button type="button" onClick={run} loading={pending} leadingIcon={<ShieldCheck />} data-testid="terms-accept-run">
            {t("accept")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Checkbox label={t("agree")} checked={agree} onChange={(e) => setAgree(e.target.checked)} disabled={pending} />
        <FormField label={t("note")} hint={t("noteHint")}>
          <Textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} disabled={pending} />
        </FormField>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function RecordDialog({ termsId, dealId, brandPending, talents, onClose }: { termsId: string; dealId: string; brandPending: boolean; talents: { dealTalentId: string; name: string }[]; onClose: () => void }) {
  const ta = useTranslations("agency.terms");
  const { toast } = useToast();
  const [party, setParty] = useState<"brand" | "talent">(brandPending ? "brand" : "talent");
  const [dealTalentId, setDealTalentId] = useState(talents[0]?.dealTalentId ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function run() {
    setError(null);
    if (note.trim().length < 5) return setError(ta("noteRequired"));
    start(async () => {
      const result = await recordAcceptanceAction({ termsId, dealId, party, dealTalentId: party === "talent" ? dealTalentId : "", documentId: "", note: note.trim() });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={ta("recordTitle")}
      description={ta("recordHint")}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {ta("back")}
          </Button>
          <Button type="button" onClick={run} loading={pending}>
            {ta("recordSave")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label={ta("party")}>
          <Select value={party} onChange={(e) => setParty(e.target.value as "brand" | "talent")} disabled={pending}>
            {brandPending ? <option value="brand">{ta("partyBrand")}</option> : null}
            {talents.length > 0 ? <option value="talent">{ta("partyTalent")}</option> : null}
          </Select>
        </FormField>
        {party === "talent" ? (
          <FormField label={ta("talent")}>
            <Select value={dealTalentId} onChange={(e) => setDealTalentId(e.target.value)} disabled={pending}>
              {talents.map((x) => (
                <option key={x.dealTalentId} value={x.dealTalentId}>
                  {x.name}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
        <FormField label={ta("recordNote")} hint={ta("recordNoteHint")} required>
          <Textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} disabled={pending} />
        </FormField>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
