"use client";

import { Check, Minus, Plus, Send, UserMinus, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { consultTalentsAction, recordResponseAction, removeDealTalentAction, setFeeAction, setShortlistAction } from "@/app/agencia/negocios/actions";
import { Avatar, Badge, Button, Checkbox, Dialog, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { DealTalentRow } from "@/lib/deals/queries";
import { formatCents, parseBrlToCents } from "@/lib/deals/schemas";
import { isPreConfirmation, type DealStage } from "@/lib/deals/stages";
import { CONSULT_DAYS, TALENT_RESPONSES, type TalentResponse } from "@/lib/deals/vocab";
import { TalentStatusBadge } from "./StatusBadges";

export type Candidate = { id: string; name: string; avatarUrl: string | null; city: string | null; state: string | null; availability: string; hasLogin: boolean; reasons: DealTalentRow["reasons"] };

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
};

// Elenco do negócio: sugeridos com os critérios atendidos, consulta de interesse (só com cachê definido),
// resposta do creator (pelo escritório) ou registrada pela agência (talento sem login), cachê (só Adm) e
// remoção. O cachê é a única coisa com valor nesta tela e só aparece para quem o banco devolve.
export function ShortlistPanel({ dealId, stage, rows, candidates, fees, canEdit, isAdmin, documents }: Props) {
  const t = useTranslations("agency.deal.talents");
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
                  {row.respondedAt ? (
                    <p className="type-body-sm text-fg">
                      {t(row.responseChannel === "agency_record" ? "answeredByAgency" : "answeredByCreator", { date: formatDateTime(row.respondedAt, locale) })}
                      {row.responseNote ? <span className="text-fg-muted"> — “{row.responseNote}”</span> : null}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {isAdmin ? (
                    <span className="font-mono text-sm font-semibold text-fg native:hidden" data-testid="deal-fee">
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
                    <Button type="button" size="sm" variant="secondary" leadingIcon={<Wallet />} onClick={() => setFeeFor(row)} disabled={pending} className="native:hidden">
                      {t("setFee")}
                    </Button>
                  ) : null}
                  {!row.talent.hasLogin && ["consulted", "talk_requested"].includes(row.status) ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => setRecording(row)} disabled={pending}>
                      {t("recordResponse")}
                    </Button>
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

      <AddTalentsDialog open={adding} onOpenChange={setAdding} dealId={dealId} candidates={candidates} current={rows.filter((r) => r.status !== "removed").map((r) => ({ talentId: r.talentId, reasons: r.reasons, keep: r.status !== "suggested" }))} />
      <ConsultDialog open={consulting} onOpenChange={setConsulting} dealId={dealId} dealTalentIds={picked} onDone={() => setPicked([])} />
      {recording ? <RecordResponseDialog row={recording} dealId={dealId} documents={documents} onClose={() => setRecording(null)} /> : null}
      {feeFor ? <FeeDialog row={feeFor} dealId={dealId} current={fees[feeFor.id]} onClose={() => setFeeFor(null)} /> : null}
    </div>
  );
}

function AddTalentsDialog({ open, onOpenChange, dealId, candidates, current }: { open: boolean; onOpenChange: (o: boolean) => void; dealId: string; candidates: Candidate[]; current: { talentId: string; reasons: DealTalentRow["reasons"]; keep: boolean }[] }) {
  const t = useTranslations("agency.deal.talents");
  const tr = useTranslations("commercial.reasons");
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [ids, setIds] = useState<string[]>(current.map((c) => c.talentId));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const locked = new Set(current.filter((c) => c.keep).map((c) => c.talentId));
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return candidates.filter((c) => !needle || c.name.toLowerCase().includes(needle)).sort((a, b) => b.reasons.filter((r) => r.met).length - a.reasons.filter((r) => r.met).length || a.name.localeCompare(b.name));
  }, [candidates, q]);

  function save() {
    setError(null);
    start(async () => {
      const items = ids.map((id) => ({ talentId: id, reasons: candidates.find((c) => c.id === id)?.reasons ?? current.find((c) => c.talentId === id)?.reasons ?? [] }));
      const result = await setShortlistAction({ dealId, items });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("addTitle")}
      description={t("addHint")}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("back")}
          </Button>
          <Button type="button" onClick={save} loading={pending} data-testid="shortlist-save">
            {t("saveShortlist", { count: ids.length })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label={t("search")}>
          <Input value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} />
        </FormField>
        {list.length === 0 ? <p className="type-body-sm text-fg-muted">{t("noCandidates")}</p> : null}
        <ul className="flex max-h-[50vh] flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border">
          {list.map((c) => {
            const met = c.reasons.filter((r) => r.met);
            return (
              <li key={c.id} className="flex items-start gap-3 p-3">
                <Checkbox aria-label={c.name} checked={ids.includes(c.id)} disabled={pending || locked.has(c.id)} onChange={(e) => setIds((cur) => (e.target.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id)))} />
                <Avatar src={c.avatarUrl} name={c.name} size="sm" alt="" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-medium text-fg">{c.name}</span>
                  <span className="type-caption text-fg-muted">{[c.city, c.state].filter(Boolean).join(" · ") || t("noLocation")}</span>
                  <span className="flex flex-wrap gap-1">
                    {c.reasons.map((r) => (
                      <Badge key={r.code} size="sm" variant={r.met ? "success" : "neutral"}>
                        {tr(r.code)}
                      </Badge>
                    ))}
                    {c.reasons.length > 0 ? <span className="type-caption text-fg-muted">{t("matchCount", { met: met.length, total: c.reasons.length })}</span> : null}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function ConsultDialog({ open, onOpenChange, dealId, dealTalentIds, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; dealId: string; dealTalentIds: string[]; onDone: () => void }) {
  const t = useTranslations("agency.deal.consultDialog");
  const { toast } = useToast();
  const [days, setDays] = useState<number>(7);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    setError(null);
    start(async () => {
      const result = await consultTalentsAction({ dealId, dealTalentIds, days, message: message.trim() });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setMessage("");
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
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [text, setText] = useState(current !== undefined ? formatCents(current, locale).replace(/[^\d,.\s]/g, "").trim() : "");
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
          <Input inputMode="decimal" value={text} maxLength={20} placeholder="0,00" onChange={(e) => setText(e.target.value)} disabled={pending} />
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
