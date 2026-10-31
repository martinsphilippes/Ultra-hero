"use client";

import { Archive, Eye, FileText, Lock, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { Badge, Button, Checkbox, FormField, Input, Select, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { archiveDocumentAction, confirmDocumentAction, reserveDocumentAction, signedUrlAction } from "@/lib/documents/actions";
import { DOCUMENT_MAX_BYTES, DOCUMENT_MIME_TYPES, type DocumentMime, type DocumentScope } from "@/lib/documents/constants";
import { createClient } from "@/lib/supabase/client";

export type PanelDocument = { id: string; title: string; kind: string; createdAt: string; shareTalent: boolean; restricted: boolean; uploaderSide: string };

type Props = {
  agencyId: string;
  scope: { type: DocumentScope; id: string };
  documents: PanelDocument[];
  canUpload: boolean;
  /** Só o Adm reserva contrato (tem preço) e marca restrito. */
  canContract: boolean;
  /** Agência de demonstração: sem envio (D6). Texto vindo do servidor. */
  lockedNote?: string | null;
  revalidate: string;
};

// Documentos por escopo (bucket privado agency-docs): o banco escolhe o caminho, o navegador envia o
// arquivo direto ao Storage (só para a própria reserva) e confirma. Abrir gera URL assinada de 60 s.
export function DocumentsPanel({ agencyId, scope, documents, canUpload, canContract, lockedNote, revalidate }: Props) {
  const t = useTranslations("agency.documents");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"other" | "contract" | "brief_attachment" | "report" | "media">("other");
  const [shareTalent, setShareTalent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function upload(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setError(t("pickFile"));
    if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) return setError(t("badType"));
    if (file.size < 1 || file.size > DOCUMENT_MAX_BYTES) return setError(t("tooLarge"));
    start(async () => {
      const reserved = await reserveDocumentAction({
        agencyId,
        scopeType: scope.type,
        scopeId: scope.id,
        kind,
        title: title.trim() || file.name.slice(0, 120),
        mimeType: file.type as DocumentMime,
        sizeBytes: file.size,
        shareTalent,
        revalidate,
      });
      if (!reserved.ok || !reserved.id || !reserved.path) return setError(reserved.ok ? t("uploadFailed") : reserved.error);
      const { error: uploadError } = await createClient().storage.from("agency-docs").upload(reserved.path, file, { upsert: false, contentType: file.type });
      if (uploadError) return setError(t("uploadFailed"));
      const confirmed = await confirmDocumentAction({ id: reserved.id, revalidate });
      if (!confirmed.ok) return setError(confirmed.error);
      toast({ title: confirmed.message, variant: "success" });
      setTitle("");
      setShareTalent(false);
      setKind("other");
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function open(id: string) {
    start(async () => {
      const result = await signedUrlAction({ id });
      if (!result.ok || !result.url) {
        toast({ title: result.ok ? t("openFailed") : result.error, variant: "error" });
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  function archive(id: string) {
    if (!window.confirm(t("confirmArchive"))) return;
    start(async () => {
      const result = await archiveDocumentAction({ id, revalidate });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="documents-panel">
      {documents.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 p-3">
              <FileText className="size-5 shrink-0 text-fg-subtle" aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-fg">{d.title}</span>
                <span className="flex flex-wrap items-center gap-1.5 type-caption text-fg-muted">
                  {t(`kinds.${d.kind}`)} · {formatDate(d.createdAt, locale)}
                  {d.restricted ? (
                    <Badge size="sm" icon={<Lock />}>
                      {t("restricted")}
                    </Badge>
                  ) : null}
                  {d.shareTalent ? <Badge size="sm">{t("sharedTalent")}</Badge> : null}
                  {d.uploaderSide === "talent" ? <Badge size="sm">{t("fromTalent")}</Badge> : null}
                </span>
              </span>
              <span className="flex gap-1">
                <Button type="button" size="sm" variant="secondary" leadingIcon={<Eye />} onClick={() => open(d.id)} disabled={pending}>
                  {t("open")}
                </Button>
                {canUpload ? (
                  <Button type="button" size="sm" variant="ghost" leadingIcon={<Archive />} onClick={() => archive(d.id)} disabled={pending} aria-label={t("archiveLabel", { title: d.title })}>
                    <span className="sr-only sm:not-sr-only">{t("archive")}</span>
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {lockedNote ? (
        <p className="flex items-start gap-2 rounded-xl border border-dashed border-border px-3 py-2 type-body-sm text-fg-muted">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {lockedNote}
        </p>
      ) : canUpload ? (
        <form onSubmit={upload} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" noValidate data-testid="document-upload">
          <h3 className="text-sm font-semibold text-fg">{t("uploadTitle")}</h3>
          <FormField label={t("file")} hint={t("fileHint")} required>
            <input
              ref={fileRef}
              type="file"
              accept={DOCUMENT_MIME_TYPES.join(",")}
              disabled={pending}
              className="block w-full text-sm text-fg file:mr-3 file:rounded-lg file:border-0 file:bg-surface-hover file:px-3 file:py-2 file:text-sm file:font-medium"
            />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t("title")}>
              <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} disabled={pending} />
            </FormField>
            <FormField label={t("kind")}>
              <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} disabled={pending}>
                <option value="other">{t("kinds.other")}</option>
                {scope.type === "deal" || scope.type === "request" ? <option value="brief_attachment">{t("kinds.brief_attachment")}</option> : null}
                <option value="report">{t("kinds.report")}</option>
                <option value="media">{t("kinds.media")}</option>
                {canContract ? <option value="contract">{t("kinds.contract")}</option> : null}
              </Select>
            </FormField>
          </div>
          <Checkbox label={t("shareTalent")} description={t("shareTalentHint")} checked={shareTalent} onChange={(e) => setShareTalent(e.target.checked)} disabled={pending} />
          {error ? (
            <p role="alert" className="type-body-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="sm" leadingIcon={<Upload />} loading={pending} className="w-fit">
            {t("upload")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
