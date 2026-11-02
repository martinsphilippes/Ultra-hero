"use client";

import { BarChart3, MessageSquareText, Play, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useRef, useState, useTransition } from "react";
import { Button, Dialog, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { signedUrlAction } from "@/lib/documents/actions";
import type { ExecDeliverable } from "@/lib/execution/queries";
import { addCommentAction, deleteCommentAction, recordMetricsAction } from "@/lib/media/actions";
import { currentMetrics, engagementRate, METRIC_KEYS, parseMetricInput, type MetricKey, type MetricReading } from "@/lib/media/metrics";
import type { DealComment } from "@/lib/media/queries";
import { embedUrl, formatTimestamp, parseTimestamp, videoSource, youTubeId, type VideoSource } from "@/lib/media/video";

export type MediaPortal = "agency" | "brand" | "office";
export type DeliverableMediaData = { readings: MetricReading[]; comments: DealComment[]; youtubeConfigured: boolean; today: string };

type Props = {
  portal: MediaPortal;
  deliverable: ExecDeliverable;
  data: DeliverableMediaData;
  dealId: string;
  requestId?: string | null;
  dealTalentId?: string | null;
  canAct: boolean;
};

const PUBLISHED = ["published", "proof_submitted", "done"];

// Métricas e comentários de um entregável (0083): números atuais (a leitura mais recente de cada métrica), o
// formulário "informar números" (influenciador e agência; a marca só lê) e, por versão enviada, o player com os
// comentários no segundo exato (marca e agência comentam; o influenciador lê). Clicar no tempo abre o vídeo ali.
export function DeliverableMedia({ portal, deliverable, data, dealId, requestId, dealTalentId, canAct }: Props) {
  const published = PUBLISHED.includes(deliverable.status);
  const submissions = deliverable.versions.filter((v) => v.kind === "submission");
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      {published ? <MetricsBlock portal={portal} deliverable={deliverable} data={data} refs={{ dealId, requestId, dealTalentId }} canRecord={canAct && portal !== "brand"} /> : null}
      {submissions.length > 0 ? <CommentsBlock portal={portal} deliverable={deliverable} comments={data.comments} refs={{ dealId, requestId, dealTalentId }} canComment={canAct && portal !== "office" && deliverable.status !== "cancelled"} /> : null}
    </div>
  );
}

type Refs = { dealId: string; requestId?: string | null; dealTalentId?: string | null };

function MetricsBlock({ portal, deliverable, data, refs, canRecord }: { portal: MediaPortal; deliverable: ExecDeliverable; data: DeliverableMediaData; refs: Refs; canRecord: boolean }) {
  const t = useTranslations("media.metrics");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const current = currentMetrics(data.readings);
  const shown = METRIC_KEYS.filter((k) => current.values[k] !== null);
  const rate = engagementRate(current.values);
  const isYouTube = youTubeId(deliverable.publishedUrl) !== null;
  const nf = new Intl.NumberFormat(locale);
  return (
    <section className="flex flex-col gap-2" aria-label={t("title")} data-testid="deliverable-metrics">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg">
          <BarChart3 className="size-4" aria-hidden="true" />
          {t("title")}
        </span>
        {canRecord ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)} data-testid="metrics-record">
            {t("record")}
          </Button>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="type-caption text-fg-muted">{t("empty")}</p>
      ) : (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {shown.map((k) => (
            <div key={k} className="flex flex-col rounded-xl bg-surface-hover px-3 py-2">
              <dt className="type-caption text-fg-muted">{t(`labels.${k}`)}</dt>
              <dd className="font-mono text-base font-semibold text-fg">{nf.format(current.values[k] as number)}</dd>
            </div>
          ))}
          {rate !== null ? (
            <div className="flex flex-col rounded-xl bg-surface-hover px-3 py-2">
              <dt className="type-caption text-fg-muted">{t("engagement")}</dt>
              <dd className="font-mono text-base font-semibold text-fg">{nf.format(rate)}%</dd>
            </div>
          ) : null}
        </dl>
      )}
      {current.lastOn ? <p className="type-caption text-fg-muted">{t("updatedOn", { date: formatPlainDate(current.lastOn, locale) })}</p> : null}
      {isYouTube ? <p className={`type-caption ${data.youtubeConfigured ? "text-fg-muted" : "text-warning"}`}>{data.youtubeConfigured ? t("youtubeAuto") : t("youtubeOff")}</p> : null}
      {open ? <MetricsDialog portal={portal === "office" ? "office" : "agency"} deliverableId={deliverable.id} today={data.today} refs={refs} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function MetricsDialog({ portal, deliverableId, today, refs, onClose }: { portal: "agency" | "office"; deliverableId: string; today: string; refs: Refs; onClose: () => void }) {
  const t = useTranslations("media.metrics");
  const tc = useTranslations("media.common");
  const { toast } = useToast();
  const [measuredOn, setMeasuredOn] = useState(today);
  const [values, setValues] = useState<Record<MetricKey, string>>(() => Object.fromEntries(METRIC_KEYS.map((k) => [k, ""])) as Record<MetricKey, string>);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    const parsed: Partial<Record<MetricKey, number | null>> = {};
    for (const k of METRIC_KEYS) {
      const v = parseMetricInput(values[k]);
      if (v === undefined) return setError(t("invalidNumber", { field: t(`labels.${k}`) }));
      if (v !== null) parsed[k] = v;
    }
    if (Object.keys(parsed).length === 0) return setError(t("needOne"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(measuredOn) || measuredOn > today) return setError(t("invalidDate"));
    start(async () => {
      const result = await recordMetricsAction(portal, { ...refs, deliverableId, measuredOn, values: parsed });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)} title={t("dialogTitle")} description={t("dialogHint")}>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FormField label={t("measuredOn")} required>
          <Input type="date" value={measuredOn} max={today} onChange={(e) => setMeasuredOn(e.target.value)} disabled={pending} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          {METRIC_KEYS.map((k) => (
            <FormField key={k} label={t(`labels.${k}`)}>
              <Input inputMode="numeric" value={values[k]} maxLength={17} onChange={(e) => setValues((cur) => ({ ...cur, [k]: e.target.value }))} disabled={pending} data-testid={`metric-${k}`} />
            </FormField>
          ))}
        </div>
        <p className="type-caption text-fg-muted">{t("noScreenshot")}</p>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {tc("cancel")}
          </Button>
          <Button type="submit" loading={pending} data-testid="metrics-save">
            {tc("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CommentsBlock({ portal, deliverable, comments, refs, canComment }: { portal: MediaPortal; deliverable: ExecDeliverable; comments: DealComment[]; refs: Refs; canComment: boolean }) {
  const t = useTranslations("media.comments");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const submissions = useMemo(() => deliverable.versions.filter((v) => v.kind === "submission").sort((a, b) => b.revision - a.revision), [deliverable.versions]);
  const [versionId, setVersionId] = useState(submissions[0]?.id ?? "");
  const version = submissions.find((v) => v.id === versionId) ?? submissions[0];
  const list = comments.filter((c) => c.versionId === version?.id).sort((a, b) => (a.atSeconds ?? -1) - (b.atSeconds ?? -1) || a.createdAt.localeCompare(b.createdAt));
  const linkSource = version?.url ? videoSource(version.url) : null;
  const [source, setSource] = useState<VideoSource | null>(null);
  const [seek, setSeek] = useState<{ at: number | null; n: number }>({ at: null, n: 0 });
  const [loadingFile, setLoadingFile] = useState(false);
  const [noPlayer, setNoPlayer] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [body, setBody] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [deleting, startDelete] = useTransition();
  if (!version) return null;

  async function openPlayer(at: number | null) {
    setNoPlayer(false);
    if (linkSource) {
      setSource(linkSource);
      setSeek((s) => ({ at, n: s.n + 1 }));
      return;
    }
    if (version?.documentId) {
      if (source?.kind === "file") {
        setSeek((s) => ({ at, n: s.n + 1 }));
        if (videoRef.current && at !== null) {
          videoRef.current.currentTime = at;
          void videoRef.current.play().catch(() => undefined);
        }
        return;
      }
      setLoadingFile(true);
      const result = await signedUrlAction({ id: version.documentId });
      setLoadingFile(false);
      if (!result.ok || !result.url) return setNoPlayer(true);
      setSource({ kind: "file", url: result.url });
      setSeek((s) => ({ at, n: s.n + 1 }));
      return;
    }
    setNoPlayer(true);
  }

  function submit() {
    setError(null);
    const at = parseTimestamp(time);
    if (at === undefined) return setError(t("invalidTime"));
    if (!body.trim()) return setError(t("emptyBody"));
    start(async () => {
      const result = await addCommentAction(portal === "agency" ? "agency" : "brand", { ...refs, versionId: version!.id, body: body.trim(), atSeconds: at });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setBody("");
      setTime("");
    });
  }

  const playable = Boolean(linkSource || version.documentId);
  return (
    <section className="flex flex-col gap-2" aria-label={t("title")} data-testid="deliverable-comments">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg">
          <MessageSquareText className="size-4" aria-hidden="true" />
          {t("title")}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {submissions.length > 1 ? (
            <Select value={version.id} onChange={(e) => { setVersionId(e.target.value); setSource(null); }} aria-label={t("versionLabel")} className="h-9 w-auto">
              {submissions.map((v) => (
                <option key={v.id} value={v.id}>
                  {t("version", { n: v.revision })}
                </option>
              ))}
            </Select>
          ) : null}
          {playable ? (
            <Button type="button" size="sm" variant="secondary" leadingIcon={<Play />} onClick={() => void openPlayer(null)} loading={loadingFile} data-testid="video-open">
              {t("watch")}
            </Button>
          ) : null}
        </span>
      </div>
      {noPlayer ? <p className="type-caption text-fg-muted">{t("noPlayer")}</p> : null}
      {source ? (
        <div className="overflow-hidden rounded-xl border border-border bg-black" data-testid="video-player">
          {source.kind === "file" ? (
            <video
              ref={videoRef}
              key={source.url}
              src={source.url}
              controls
              playsInline
              className="aspect-video w-full"
              onLoadedMetadata={(e) => {
                if (seek.at !== null) e.currentTarget.currentTime = seek.at;
              }}
            />
          ) : (
            <iframe key={`${seek.n}`} src={embedUrl(source, seek.at)} title={t("playerTitle")} className="aspect-video w-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          )}
        </div>
      ) : null}
      {list.length === 0 ? (
        <p className="type-caption text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((c) => (
            <li key={c.id} className="flex items-start gap-2 rounded-xl bg-surface-hover px-3 py-2" data-testid="deliverable-comment">
              {c.atSeconds !== null ? (
                <button
                  type="button"
                  onClick={() => void openPlayer(c.atSeconds)}
                  disabled={!playable}
                  className="min-h-9 shrink-0 rounded-lg bg-accent-soft px-2 font-mono text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:no-underline"
                  aria-label={t("seekTo", { time: formatTimestamp(c.atSeconds) })}
                >
                  {formatTimestamp(c.atSeconds)}
                </button>
              ) : null}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="whitespace-pre-wrap text-sm text-fg">{c.body}</span>
                <span className="type-caption text-fg-muted">
                  {c.authorLabel ? `${c.authorLabel} · ` : ""}
                  {t(`by.${c.authorSide}`)} · {formatDateTime(c.createdAt, locale)}
                </span>
              </span>
              {c.mine ? (
                <button
                  type="button"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-surface hover:text-danger focus-visible:outline-2 focus-visible:outline-focus"
                  aria-label={t("delete")}
                  disabled={deleting}
                  onClick={() =>
                    startDelete(async () => {
                      const result = await deleteCommentAction(portal === "agency" ? "agency" : "brand", { ...refs, id: c.id });
                      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
                    })
                  }
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canComment ? (
        <form
          className="flex flex-col gap-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex gap-2">
            <FormField label={t("time")} hint={t("timeHint")} className="w-28 shrink-0">
              <Input inputMode="numeric" value={time} maxLength={8} placeholder="0:00" onChange={(e) => setTime(e.target.value)} disabled={pending} data-testid="comment-time" />
            </FormField>
            {source?.kind === "file" ? (
              <Button type="button" size="sm" variant="ghost" className="mt-6 self-start" onClick={() => setTime(formatTimestamp(videoRef.current?.currentTime ?? 0))}>
                {t("now")}
              </Button>
            ) : null}
          </div>
          <FormField label={t("body")}>
            <Textarea value={body} rows={2} maxLength={1000} onChange={(e) => setBody(e.target.value)} disabled={pending} data-testid="comment-body" />
          </FormField>
          {error ? (
            <p role="alert" className="type-body-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="sm" className="self-end" loading={pending} data-testid="comment-send">
            {t("add")}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
