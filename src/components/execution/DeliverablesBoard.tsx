"use client";

import { ExternalLink, Send, ThumbsDown, ThumbsUp, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { DeliverableStatusBadge } from "@/components/deals/StatusBadges";
import { Badge, Button, Dialog, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { closeDeliverableAction, decideDeliverableAction, proofDeliverableAction, publishDeliverableAction, submitDeliverableAction } from "@/lib/execution/actions";
import type { ExecDeliverable } from "@/lib/execution/queries";
import { deliverableNextAction } from "@/lib/execution/vocab";

type Portal = "agency" | "brand" | "office";
type Props = {
  portal: Portal;
  dealId: string;
  requestId?: string | null;
  dealTalentId?: string | null;
  deliverables: ExecDeliverable[];
  canAct?: boolean;
  /** Documentos do negócio que podem ser anexados (envio/comprovação) em vez de um link. */
  documents?: { id: string; title: string }[];
  emptyText: string;
};

type Mode = "submit" | "decide" | "publish" | "proof" | "close";

// Entregas com versões: cada envio é uma versão nova (nunca herda aprovação); a marca aprova ou pede ajustes com
// feedback; publicar registra a URL; comprovar fecha o ciclo; a agência conclui ou cancela. Sem valores.
export function DeliverablesBoard({ portal, dealId, requestId, dealTalentId, deliverables, canAct = false, documents = [], emptyText }: Props) {
  const t = useTranslations("commercial.deliverables");
  const tk = useTranslations("commercial.deliverableKinds");
  const tn = useTranslations("mediaKit.networks");
  const locale = useLocale() as Locale;
  const [dialog, setDialog] = useState<{ mode: Mode; item: ExecDeliverable } | null>(null);
  const side = portal === "office" ? "talent" : portal;

  return (
    <div className="flex flex-col gap-3" data-testid="deliverables-board">
      {deliverables.length === 0 ? <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{emptyText}</p> : null}
      {deliverables.map((d) => {
        const next = canAct ? deliverableNextAction(d.status, side) : null;
        const submissions = d.versions.filter((v) => v.kind === "submission");
        const proofs = d.versions.filter((v) => v.kind === "proof");
        return (
          <article key={d.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="deliverable-card" data-status={d.status}>
            <header className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-fg">{d.title || tk(d.kind)}</span>
              <Badge size="sm">{tk(d.kind)}</Badge>
              {d.network ? <Badge size="sm">{tn(d.network)}</Badge> : null}
              <DeliverableStatusBadge status={d.status} />
              {d.revision > 0 ? <span className="type-caption text-fg-muted">{t("revision", { n: d.revision })}</span> : null}
            </header>
            <p className="type-caption text-fg-muted">
              {portal !== "office" ? `${d.talentName} · ` : ""}
              {d.dueAt ? t("dueAt", { date: formatPlainDate(d.dueAt.slice(0, 10), locale) }) : t("noDue")}
              {d.publishAt ? ` · ${t("publishAt", { date: formatPlainDate(d.publishAt.slice(0, 10), locale) })}` : ""}
            </p>
            {d.brief ? <p className="type-body-sm text-fg-muted">{d.brief}</p> : null}
            {d.status === "changes_requested" && d.brandFeedback ? <p className="rounded-xl border border-warning/40 bg-warning-soft/40 px-3 py-2 text-sm text-fg">{t("changesFeedback", { text: d.brandFeedback })}</p> : null}
            {d.publishedUrl ? (
              <a href={d.publishedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-text underline-offset-2 hover:underline">
                <ExternalLink className="size-4" aria-hidden="true" />
                {t("openPublished")}
              </a>
            ) : null}
            {submissions.length > 0 || proofs.length > 0 ? (
              <ol className="flex flex-col gap-1 border-l-2 border-border pl-3" aria-label={t("versionsLabel")}>
                {[...submissions, ...proofs].map((v) => (
                  <li key={v.id} className="flex flex-col gap-0.5 type-caption text-fg-muted" data-testid="deliverable-version">
                    <span className="text-fg">
                      {v.kind === "proof" ? t("proofVersion", { n: v.revision }) : t("submissionVersion", { n: v.revision })} · {formatDateTime(v.submittedAt, locale)} · {t(`submittedBy.${v.submittedSide}`)}
                      {v.url ? (
                        <>
                          {" · "}
                          <a href={v.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-text underline-offset-2 hover:underline">
                            {t("openLink")}
                          </a>
                        </>
                      ) : null}
                      {v.documentId ? ` · ${t("withDocument")}` : ""}
                    </span>
                    {v.note ? <span>“{v.note}”</span> : null}
                    {v.decision ? (
                      <span className={v.decision === "approved" ? "text-success" : "text-warning"}>
                        {t(`decision.${v.decision}`)} · {v.decidedAt ? formatDateTime(v.decidedAt, locale) : ""} · {t(`decidedBy.${v.decidedSide ?? "brand"}`)}
                        {v.feedback ? ` — “${v.feedback}”` : ""}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : null}
            {next ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" leadingIcon={next === "decide" ? <ThumbsUp /> : next === "submit" || next === "proof" ? <Upload /> : <Send />} onClick={() => setDialog({ mode: next, item: d })} data-testid={`deliverable-${next}`}>
                  {t(`actions.${next}`)}
                </Button>
                {portal === "agency" && !["done", "cancelled"].includes(d.status) && next !== "close" ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setDialog({ mode: "close", item: d })}>
                    {t("actions.cancel")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
      {dialog ? <ActionDialog portal={portal} mode={dialog.mode} item={dialog.item} dealId={dealId} requestId={requestId} dealTalentId={dealTalentId} documents={documents} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function ActionDialog({ portal, mode, item, dealId, requestId, dealTalentId, documents, onClose }: { portal: Portal; mode: Mode; item: ExecDeliverable; dealId: string; requestId?: string | null; dealTalentId?: string | null; documents: { id: string; title: string }[]; onClose: () => void }) {
  const t = useTranslations("commercial.deliverables");
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = { deliverableId: item.id, dealId, requestId, dealTalentId };
  const actPortal = portal === "office" ? "office" : "agency";

  function run(decision?: "approved" | "changes_requested" | "done" | "cancelled") {
    setError(null);
    const u = url.trim();
    if ((mode === "submit" || mode === "proof") && !u && !documentId) return setError(t("linkOrFile"));
    if ((mode === "submit" || mode === "proof" || mode === "publish") && u && !/^https:\/\//.test(u)) return setError(t("httpsOnly"));
    if (mode === "publish" && !u) return setError(t("httpsOnly"));
    if (mode === "decide" && decision === "changes_requested" && note.trim().length < 5) return setError(t("feedbackRequired"));
    if (mode === "decide" && portal === "agency" && note.trim().length < 5) return setError(t("feedbackRequired"));
    if (mode === "close" && decision === "cancelled" && note.trim().length < 5) return setError(t("feedbackRequired"));
    start(async () => {
      let result;
      if (mode === "submit") result = await submitDeliverableAction(actPortal, { ...ref, url: u, documentId, note: note.trim() });
      else if (mode === "proof") result = await proofDeliverableAction(actPortal, { ...ref, url: u, documentId, note: "" });
      else if (mode === "publish") result = await publishDeliverableAction(actPortal, { ...ref, url: u });
      else if (mode === "decide") result = await decideDeliverableAction(portal === "brand" ? "brand" : "agency", { ...ref, decision: decision === "changes_requested" ? "changes_requested" : "approved", feedback: note.trim() });
      else result = await closeDeliverableAction({ ...ref, status: decision === "cancelled" ? "cancelled" : "done", note: note.trim() });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }

  const needsLink = mode === "submit" || mode === "proof" || mode === "publish";
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)} title={t(`dialog.${mode}.title`)} description={t(`dialog.${mode}.hint`)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === "submit" || mode === "proof" || mode === "publish") run();
        }}
        className="flex flex-col gap-3"
        noValidate
      >
        {mode === "decide" && item.submissionUrl ? (
          <a href={item.submissionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-text underline-offset-2 hover:underline">
            <ExternalLink className="size-4" aria-hidden="true" />
            {t("openSubmission")}
          </a>
        ) : null}
        {needsLink ? (
          <FormField label={t("url")} hint={t("urlHint")} required={mode === "publish" || documents.length === 0}>
            <Input type="url" inputMode="url" value={url} maxLength={500} placeholder="https://" onChange={(e) => setUrl(e.target.value)} disabled={pending} />
          </FormField>
        ) : null}
        {(mode === "submit" || mode === "proof") && documents.length > 0 ? (
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
        {mode !== "publish" && mode !== "proof" ? (
          <FormField label={mode === "submit" ? t("note") : t("feedbackLabel")} hint={mode === "decide" ? t("feedbackHint") : undefined}>
            <Textarea value={note} maxLength={1000} rows={3} onChange={(e) => setNote(e.target.value)} disabled={pending} />
          </FormField>
        ) : null}
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("back")}
          </Button>
          {mode === "decide" ? (
            <>
              <Button type="button" variant="secondary" leadingIcon={<ThumbsDown />} onClick={() => run("changes_requested")} disabled={pending}>
                {t("requestChanges")}
              </Button>
              <Button type="button" leadingIcon={<ThumbsUp />} onClick={() => run("approved")} loading={pending} data-testid="deliverable-approve">
                {t("approve")}
              </Button>
            </>
          ) : mode === "close" ? (
            <>
              <Button type="button" variant="danger" onClick={() => run("cancelled")} disabled={pending}>
                {t("actions.cancel")}
              </Button>
              {item.status === "proof_submitted" ? (
                <Button type="button" onClick={() => run("done")} loading={pending}>
                  {t("actions.close")}
                </Button>
              ) : null}
            </>
          ) : (
            <Button type="submit" loading={pending} data-testid="deliverable-send">
              {t(`actions.${mode}`)}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
