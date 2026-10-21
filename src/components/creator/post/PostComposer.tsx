"use client";

import { Camera, CircleCheck, ExternalLink, Images, LoaderCircle, Plus, RotateCcw, Send, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { Upload } from "tus-js-client";
import { discardVideoPost, publishVideoPost, startVideoPost } from "@/app/creator/post/actions";
import { Button, Chip, Dialog, FormField, Input, ProgressBar, Textarea, useToast } from "@/components/ui";
import { PILLARS, type Pillar } from "@/lib/supabase/helpers";
import { cn } from "@/lib/utils";
import { CAPTION_MAX, TITLE_MAX, normalizeDuration, uploadPercent, validateDuration, validateVideoFile } from "./validation";

type Props = { configured: boolean; defaultPillar: Pillar };

type Step = "pick" | "compose" | "done";
type UploadState =
  | { state: "idle" }
  | { state: "starting" }
  | { state: "uploading"; pct: number }
  | { state: "done" }
  | { state: "error"; error: string };
type PublishState = { state: "idle" } | { state: "publishing" } | { state: "processing" } | { state: "error"; error: string };

const CHUNK_SIZE = 50 * 1024 * 1024;
const RETRY_DELAYS = [0, 3000, 5000, 10000];
const POLL_MS = 3000;
const POLL_LIMIT_MS = 3 * 60 * 1000;
const METADATA_TIMEOUT_MS = 10_000;

// Lê a duração pelo próprio navegador; sem metadados (codec que o desktop não abre) devolve null.
function readDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.muted = true;
    const finish = (value: number | null) => {
      window.clearTimeout(timer);
      probe.onloadedmetadata = null;
      probe.onerror = null;
      probe.removeAttribute("src");
      probe.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), METADATA_TIMEOUT_MS);
    probe.onloadedmetadata = () => finish(normalizeDuration(probe.duration));
    probe.onerror = () => finish(null);
    probe.src = url;
  });
}

// Erro do tus: link vencido/apagado pede um envio novo; sem rede é "a conexão caiu".
function classifyUploadError(error: unknown): string {
  const status = (error as { originalResponse?: { getStatus?: () => number } | null })?.originalResponse?.getStatus?.();
  if (status === 404 || status === 410) return "upload_expired";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "network";
  if (!status) return "network";
  return "upload_failed";
}

// Composer de post em vídeo, pensado para o celular: escolher → enviar e escrever → publicado.
// O envio (tus, direto para o Cloudflare) roda em segundo plano enquanto a pessoa escreve.
export function PostComposer({ configured, defaultPillar }: Props) {
  const t = useTranslations("creator.post");
  const te = useTranslations("creator.post.errors");
  const tp = useTranslations("common.pillars");
  const tc = useTranslations("common.actions");
  const { toast } = useToast();
  const titleId = useId();

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<Upload | null>(null);
  const sessionRef = useRef<{ contentId: string; uploadUrl: string } | null>(null);
  const fileRef = useRef<{ file: File; durationSec: number | null } | null>(null);
  const pollRef = useRef<number | null>(null);
  // Cada vídeo escolhido ganha uma geração: respostas atrasadas de um vídeo descartado são ignoradas.
  const generationRef = useRef(0);

  const [step, setStep] = useState<Step>("pick");
  const [checking, setChecking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadState>({ state: "idle" });
  const [publish, setPublish] = useState<PublishState>({ state: "idle" });
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [pillar, setPillar] = useState<Pillar>(defaultPillar);
  const [slug, setSlug] = useState<string | null>(null);
  const [contentId, setContentId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const message = useCallback((code: string) => (te.has(code) ? te(code) : te("generic")), [te]);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) window.clearTimeout(pollRef.current);
    pollRef.current = null;
  }, []);

  // Ao sair da tela: para o envio (fica retomável no Cloudflare até o link vencer) e o polling.
  useEffect(() => {
    return () => {
      stopPolling();
      void uploadRef.current?.abort(false);
    };
  }, [stopPolling]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const busy = upload.state === "starting" || upload.state === "uploading" || publish.state === "publishing" || publish.state === "processing";

  // Sair no meio do envio perde o vídeo: o navegador pergunta antes.
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = t("leaveWarning");
      return t("leaveWarning");
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, t]);

  const runTus = useCallback(async (file: File, uploadUrl: string, generation: number) => {
    const { Upload: TusUpload } = await import("tus-js-client");
    if (generation !== generationRef.current) return;
    const current = () => generation === generationRef.current;
    const tus = new TusUpload(file, {
      uploadUrl,
      chunkSize: CHUNK_SIZE,
      retryDelays: RETRY_DELAYS,
      // O link vem do servidor a cada envio; nada a guardar no navegador.
      storeFingerprintForResuming: false,
      onProgress: (sent, total) => current() && setUpload({ state: "uploading", pct: uploadPercent(sent, total) }),
      onSuccess: () => current() && setUpload({ state: "done" }),
      onError: (error) => current() && setUpload({ state: "error", error: classifyUploadError(error) }),
    });
    uploadRef.current = tus;
    setUpload({ state: "uploading", pct: 0 });
    tus.start();
  }, []);

  const beginUpload = useCallback(async () => {
    const picked = fileRef.current;
    if (!picked) return;
    const generation = generationRef.current;
    setUpload({ state: "starting" });
    let session = sessionRef.current;
    if (!session) {
      try {
        const result = await startVideoPost({ fileSize: picked.file.size, fileName: picked.file.name, durationSec: picked.durationSec });
        if (generation !== generationRef.current) return;
        if (!result.ok) {
          setUpload({ state: "error", error: result.error });
          return;
        }
        session = { contentId: result.contentId, uploadUrl: result.uploadUrl };
        sessionRef.current = session;
        setContentId(result.contentId);
      } catch {
        if (generation === generationRef.current) setUpload({ state: "error", error: "network" });
        return;
      }
    }
    await runTus(picked.file, session.uploadUrl, generation);
  }, [runTus]);

  function retryUpload() {
    // Link vencido: um envio novo pede outro ticket (o rascunho anterior fica em Meus conteúdos).
    if (upload.state === "error" && upload.error === "upload_expired") sessionRef.current = null;
    void beginUpload();
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    setPickError(null);
    const problem = validateVideoFile(file);
    if (problem) {
      setPickError(problem);
      return;
    }
    setChecking(true);
    const url = URL.createObjectURL(file);
    const durationSec = await readDuration(url);
    setChecking(false);
    const tooLong = validateDuration(durationSec);
    if (tooLong) {
      URL.revokeObjectURL(url);
      setPickError(tooLong);
      return;
    }
    generationRef.current += 1;
    fileRef.current = { file, durationSec };
    sessionRef.current = null;
    setContentId(null);
    setPreviewUrl(url);
    setPublish({ state: "idle" });
    setStep("compose");
    void beginUpload();
  }

  function reset() {
    generationRef.current += 1;
    stopPolling();
    void uploadRef.current?.abort(false);
    uploadRef.current = null;
    sessionRef.current = null;
    fileRef.current = null;
    setPreviewUrl(null);
    setUpload({ state: "idle" });
    setPublish({ state: "idle" });
    setTitle("");
    setCaption("");
    setPillar(defaultPillar);
    setSlug(null);
    setContentId(null);
    setPickError(null);
    setStep("pick");
  }

  async function confirmDiscard() {
    setDiscarding(true);
    stopPolling();
    await uploadRef.current?.abort(false);
    let kept = Boolean(contentId);
    if (contentId) {
      try {
        const result = await discardVideoPost({ contentId });
        kept = !(result.ok && result.deleted);
      } catch {
        kept = true;
      }
    }
    setDiscarding(false);
    setDiscardOpen(false);
    reset();
    if (kept) toast({ title: t("discarded"), description: t("discardedKept") });
  }

  const trimmedTitle = title.trim();
  const uploadDone = upload.state === "done";
  const publishing = publish.state === "publishing" || publish.state === "processing";
  const canPublish = uploadDone && trimmedTitle.length > 0 && !publishing && contentId !== null;

  async function doPublish() {
    if (!contentId || !canPublish) return;
    const id = contentId;
    stopPolling();
    setPublish({ state: "publishing" });
    const startedAt = Date.now();
    const generation = generationRef.current;
    const attempt = async () => {
      try {
        const result = await publishVideoPost({ contentId: id, title: trimmedTitle, caption: caption.trim(), pillar });
        if (generation !== generationRef.current) return;
        if (result.ok) {
          setSlug(result.slug);
          setPublish({ state: "idle" });
          setStep("done");
          return;
        }
        if (result.error === "processing") {
          // O Cloudflare ainda está codificando: tenta de novo a cada 3 s, por até 3 minutos.
          if (Date.now() - startedAt >= POLL_LIMIT_MS) {
            setPublish({ state: "error", error: "processing_timeout" });
            return;
          }
          setPublish({ state: "processing" });
          pollRef.current = window.setTimeout(() => void attempt(), POLL_MS);
          return;
        }
        setPublish({ state: "error", error: result.error });
      } catch {
        setPublish({ state: "error", error: "network" });
      }
    };
    await attempt();
  }

  // ------------------------------------------------------------------ passo 3
  if (step === "done") {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <Steps current="done" />
        <div role="status" className="flex flex-col items-center gap-3 rounded-2xl border border-success/30 bg-success-soft px-5 py-8 text-center">
          <CircleCheck className="size-12 text-success" aria-hidden="true" />
          <h2 className="text-2xl font-bold text-fg">{t("doneTitle")}</h2>
          <p className="type-body-sm text-fg-muted">{t("doneDescription")}</p>
        </div>
        <div className="flex flex-col gap-3">
          {slug && (
            <Button asChild size="lg" block trailingIcon={<ExternalLink />} className="min-h-14">
              <Link href={`/content/${slug}`}>{t("viewPost")}</Link>
            </Button>
          )}
          <Button type="button" size="lg" variant="secondary" block leadingIcon={<Plus />} className="min-h-14" onClick={reset}>
            {t("another")}
          </Button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ passo 1
  if (step === "pick") {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <Steps current="pick" />
        {!configured && (
          <div role="status" data-testid="video-not-configured" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-fg">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <p>{t("notConfigured")}</p>
          </div>
        )}
        <div className="flex flex-col gap-3">
          <BigChoice
            icon={<Camera />}
            label={t("record")}
            hint={t("recordHint")}
            disabled={!configured || checking}
            onClick={() => cameraRef.current?.click()}
          />
          <BigChoice
            icon={<Images />}
            label={t("gallery")}
            hint={t("galleryHint")}
            disabled={!configured || checking}
            onClick={() => galleryRef.current?.click()}
          />
          {/* Inputs escondidos: o botão grande é o alvo de toque; capture abre a câmera traseira no celular. */}
          <input ref={cameraRef} type="file" accept="video/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} data-testid="post-camera-input" />
          <input ref={galleryRef} type="file" accept="video/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} data-testid="post-gallery-input" />
        </div>
        <p className="type-caption text-center text-fg-muted">{t("limits")}</p>
        {checking && (
          <p role="status" className="flex items-center justify-center gap-2 text-sm text-fg-muted">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> {t("checking")}
          </p>
        )}
        {pickError && (
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg">
            {message(pickError)}
          </p>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------ passo 2
  const pct = upload.state === "uploading" ? upload.pct : upload.state === "done" ? 100 : 0;
  const uploadText =
    upload.state === "starting"
      ? t("starting")
      : upload.state === "uploading"
        ? t("uploading", { pct: upload.pct })
        : upload.state === "done"
          ? t("uploaded")
          : upload.state === "error"
            ? message(upload.error)
            : "";
  const publishHint = !uploadDone ? t("publishHintUpload") : !trimmedTitle ? t("publishHintTitle") : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Steps current="compose" />

      <div className="flex flex-col gap-3">
        {previewUrl && (
          <video
            src={previewUrl}
            muted
            playsInline
            controls
            autoPlay
            loop
            aria-label={t("preview")}
            className="max-h-[60vh] w-full rounded-2xl bg-black object-contain"
          />
        )}
        <div className="flex flex-col gap-2" aria-live="polite">
          <ProgressBar value={pct} label={t("uploadLabel")} tone={upload.state === "error" ? "danger" : upload.state === "done" ? "success" : "accent"} />
          <p className={cn("flex items-center gap-2 text-sm", upload.state === "error" ? "text-danger" : "text-fg-muted")} data-testid="upload-status">
            {(upload.state === "starting" || upload.state === "uploading") && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
            {upload.state === "done" && <CircleCheck className="size-4 text-success" aria-hidden="true" />}
            {uploadText}
          </p>
          {(upload.state === "starting" || upload.state === "uploading") && <p className="type-caption text-fg-muted">{t("uploadInBackground")}</p>}
          {upload.state === "error" && (
            <Button type="button" variant="secondary" size="lg" block leadingIcon={<RotateCcw />} onClick={retryUpload}>
              {t("retry")}
            </Button>
          )}
        </div>
      </div>

      <form
        className="flex flex-col gap-5"
        aria-labelledby={titleId}
        onSubmit={(event) => {
          event.preventDefault();
          void doPublish();
        }}
      >
        <h2 id={titleId} className="sr-only">
          {t("formTitle")}
        </h2>
        <FormField label={t("titleLabel")} required hint={t("counter", { count: title.length, max: TITLE_MAX })}>
          <Input value={title} maxLength={TITLE_MAX} placeholder={t("titlePlaceholder")} onChange={(e) => setTitle(e.target.value)} className="h-12 text-base" />
        </FormField>
        <FormField label={t("captionLabel")} optionalLabel={t("optional")} hint={t("counter", { count: caption.length, max: CAPTION_MAX })}>
          <Textarea value={caption} maxLength={CAPTION_MAX} rows={3} placeholder={t("captionPlaceholder")} onChange={(e) => setCaption(e.target.value)} />
        </FormField>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-fg">{t("pillarLabel")}</legend>
          <div className="flex flex-wrap gap-2">
            {PILLARS.map((p) => (
              <Chip key={p} selected={pillar === p} onClick={() => setPillar(p)} className="min-h-12 px-5 text-base">
                {tp(p)}
              </Chip>
            ))}
          </div>
        </fieldset>

        {publish.state === "processing" && (
          <p role="status" className="type-caption text-fg-muted">
            {t("processingHint")}
          </p>
        )}
        {publish.state === "error" && (
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg">
            {message(publish.error)}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Button type="submit" size="lg" block className="min-h-14 text-base" disabled={!canPublish} loading={publishing} leadingIcon={publishing ? undefined : <Send />}>
            {publish.state === "processing" ? t("processing") : publish.state === "publishing" ? t("publishing") : publish.state === "error" ? t("retryPublish") : t("publish")}
          </Button>
          {publishHint && <p className="type-caption text-center text-fg-muted">{publishHint}</p>}
        </div>
      </form>

      <Button type="button" variant="ghost" size="lg" block leadingIcon={<Trash2 />} onClick={() => setDiscardOpen(true)} disabled={publishing}>
        {t("discard")}
      </Button>
      <Dialog
        open={discardOpen}
        onOpenChange={(next) => {
          if (!discarding) setDiscardOpen(next);
        }}
        title={t("discardTitle")}
        description={t("discardDescription")}
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDiscardOpen(false)} disabled={discarding}>
              {tc("cancel")}
            </Button>
            <Button type="button" variant="danger" onClick={() => void confirmDiscard()} loading={discarding}>
              {t("discardConfirm")}
            </Button>
          </div>
        }
      />
    </div>
  );
}

function BigChoice({ icon, label, hint, disabled, onClick }: { icon: ReactNode; label: string; hint: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-20 w-full items-center gap-4 rounded-2xl border border-border-strong bg-surface-elevated px-5 py-4 text-left transition-colors",
        "hover:border-fg-subtle hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "disabled:pointer-events-none disabled:opacity-55",
      )}
    >
      <span aria-hidden="true" className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg [&>svg]:size-6">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-lg font-semibold text-fg">{label}</span>
        <span className="type-caption text-fg-muted">{hint}</span>
      </span>
    </button>
  );
}

function Steps({ current }: { current: Step }) {
  const t = useTranslations("creator.post.steps");
  const order: Step[] = ["pick", "compose", "done"];
  const index = order.indexOf(current);
  return (
    <ol aria-label={t("label")} className="grid grid-cols-3 gap-2">
      {order.map((s, i) => (
        <li key={s} aria-current={s === current ? "step" : undefined} className="flex flex-col gap-1.5">
          <span className={cn("h-1.5 rounded-full", i <= index ? "bg-accent" : "bg-surface-hover")} aria-hidden="true" />
          <span className={cn("type-caption", s === current ? "font-semibold text-fg" : "text-fg-muted")}>
            {i + 1}. {t(s)}
          </span>
        </li>
      ))}
    </ol>
  );
}
