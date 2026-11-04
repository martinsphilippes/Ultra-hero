"use client";

import { FileText, Lock, Mic, Pin, Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { Badge, Button, FilePicker, Switch, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { postRoomMessageAction, reserveRoomFileAction, roomFileUrlAction, setUsageGuideAction } from "@/lib/project-room/actions";
import type { RoomMessage } from "@/lib/project-room/queries";
import { attachmentKind, guessRoomMime, parseSystemLine, ROOM_MAX_BYTES, ROOM_MIME_TYPES, type RoomPortal, type RoomSide } from "@/lib/project-room/vocab";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Props = {
  portal: RoomPortal;
  dealId: string;
  side: RoomSide;
  messages: RoomMessage[];
  canPost: boolean;
  canInternal: boolean;
  /** Agência que pode mexer na sala: marca um PDF para todos como guia de uso. */
  canSetGuide: boolean;
  usageGuideId: string | null;
  timezone: string;
};

// Conversa única da sala (0110): texto, foto, áudio e PDF; linhas de sistema do roteiro; mensagens "internas" (agência
// + staff externo) com selo. O arquivo vai direto ao Storage (reserva do banco) e só aparece depois de publicado.
export function RoomThread({ portal, dealId, side, messages, canPost, canInternal, canSetGuide, usageGuideId, timezone }: Props) {
  const t = useTranslations("projectRoom.thread");
  const ts = useTranslations("projectRoom.system");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileKey, setFileKey] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function systemText(m: RoomMessage): string {
    const line = parseSystemLine(m.body);
    const when = line.date ? `${formatPlainDate(line.date.slice(0, 10), locale, { day: "2-digit", month: "2-digit" })} ${line.date.slice(11, 16)}` : "";
    return ts(line.code, { param: line.param, date: when, place: line.place });
  }

  function open(id: string) {
    start(async () => {
      const result = await roomFileUrlAction({ messageId: id });
      if (!result.ok || !result.url) return void toast({ title: result.ok ? t("openFailed") : result.error, variant: "error" });
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  function markGuide(id: string | null) {
    start(async () => {
      const result = await setUsageGuideAction({ dealId, messageId: id });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const text = body.trim();
    if (!text && !file) return setError(t("required"));
    if (file) {
      if (!guessRoomMime(file.name, file.type)) return setError(t("badType"));
      if (file.size < 1 || file.size > ROOM_MAX_BYTES) return setError(t("tooLarge"));
    }
    start(async () => {
      let attachmentId: string | null = null;
      if (file) {
        const reserved = await reserveRoomFileAction({ dealId, name: file.name, type: file.type, size: file.size });
        if (!reserved.ok || !reserved.id || !reserved.path) return setError(reserved.ok ? t("uploadFailed") : reserved.error);
        const mime = guessRoomMime(file.name, file.type) ?? file.type;
        const { error: uploadError } = await createClient().storage.from("agency-docs").upload(reserved.path, file, { upsert: false, contentType: mime });
        if (uploadError) return setError(t("uploadFailed"));
        attachmentId = reserved.id;
      }
      const result = await postRoomMessageAction({ portal, dealId, body: text, internal: canInternal && internal, attachmentId });
      if (!result.ok) return setError(result.error);
      setBody("");
      setFile(null);
      setFileKey((k) => k + 1);
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="room-thread">
      {messages.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col gap-2" aria-label={t("listLabel")}>
          {messages.map((m) => {
            if (m.kind === "system") {
              return (
                <li key={m.id} className="flex justify-center" data-testid="room-system-line">
                  <span className={cn("max-w-[92%] rounded-full px-3 py-1 text-center type-caption font-medium uppercase tracking-wide", m.audience === "internal" ? "bg-warning-soft/60 text-fg" : "bg-surface-hover text-fg-muted")}>
                    {systemText(m)}
                    <span className="ml-1 normal-case text-fg-subtle">· {formatDateTime(m.createdAt, locale, timezone)}</span>
                  </span>
                </li>
              );
            }
            const mine = m.mine;
            const kind = attachmentKind(m.attachment?.mime);
            return (
              <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")} data-testid="room-message" data-audience={m.audience}>
                <div className={cn("flex max-w-[88%] flex-col gap-1 rounded-2xl border px-3 py-2", m.audience === "internal" ? "border-warning/40 bg-warning-soft/30" : mine ? "border-accent/30 bg-accent-soft" : "border-border bg-surface")}>
                  <span className="flex flex-wrap items-center gap-1.5 type-caption text-fg-muted">
                    <span className="font-medium text-fg">{m.authorLabel || t(`sides.${m.authorSide}`)}</span>
                    <span>· {t(`sides.${m.authorSide}`)}</span>
                    <span>· {formatDateTime(m.createdAt, locale, timezone)}</span>
                    {m.audience === "internal" ? (
                      <Badge size="sm" variant="warning" icon={<Lock />}>
                        {t("internal")}
                      </Badge>
                    ) : null}
                    {usageGuideId === m.id ? (
                      <Badge size="sm" variant="info" icon={<Pin />}>
                        {t("guide")}
                      </Badge>
                    ) : null}
                  </span>
                  {m.body ? <p className="whitespace-pre-wrap break-words text-sm text-fg">{m.body}</p> : null}
                  {m.attachment ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" variant="secondary" className="min-h-11" leadingIcon={kind === "audio" ? <Mic /> : <FileText />} onClick={() => open(m.id)} disabled={pending} data-testid="room-attachment-open">
                        <span className="max-w-[12rem] truncate">{m.attachment.name}</span>
                      </Button>
                      {canSetGuide && kind === "pdf" && m.audience === "all" ? (
                        usageGuideId === m.id ? (
                          <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => markGuide(null)} disabled={pending}>
                            {t("unsetGuide")}
                          </Button>
                        ) : (
                          <Button type="button" size="sm" variant="ghost" className="min-h-11" leadingIcon={<Pin />} onClick={() => markGuide(m.id)} disabled={pending} data-testid="room-set-guide">
                            {t("setGuide")}
                          </Button>
                        )
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {canPost ? (
        <form onSubmit={submit} className="sticky bottom-2 flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3 shadow-sm" noValidate data-testid="room-composer">
          <label htmlFor={`room-body-${dealId}`} className="sr-only">
            {t("newMessage")}
          </label>
          <Textarea id={`room-body-${dealId}`} value={body} maxLength={4000} rows={2} onChange={(e) => setBody(e.target.value)} disabled={pending} placeholder={t("placeholder")} />
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <FilePicker key={fileKey} ref={fileRef} accept={[...ROOM_MIME_TYPES, ".m4a", ".mp3"].join(",")} disabled={pending} onFileChange={(f) => setFile(f ?? null)} data-testid="room-file" />
            </div>
            {canInternal ? <Switch size="sm" checked={internal} onCheckedChange={setInternal} label={t("internalToggle")} description={side === "staff" ? t("internalHintStaff") : t("internalHint")} /> : null}
            <Button type="submit" leadingIcon={<Send />} loading={pending} data-testid="room-send">
              {t("send")}
            </Button>
          </div>
          <p className="type-caption text-fg-subtle">{t("fileHint")}</p>
          {error ? (
            <p role="alert" className="type-body-sm text-danger">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
