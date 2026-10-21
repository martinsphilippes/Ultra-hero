"use client";

import { Camera, CircleCheck, ExternalLink, Images, LoaderCircle, Plus, RotateCcw, Send, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode, type Ref } from "react";
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

// 8 MiB: múltiplo de 256 KiB (exigência do Cloudflare) e acima do mínimo de 5 MiB; pedaço menor
// reenvia menos quando a rede móvel oscila.
const CHUNK_SIZE = 8 * 1024 * 1024;
const RETRY_DELAYS = [0, 3000, 5000, 10000];
const POLL_MS = 3000;
const POLL_LIMIT_MS = 3 * 60 * 1000;
const METADATA_TIMEOUT_MS = 10_000;
// Logo depois do tus terminar o Cloudflare ainda pode marcar pendingupload por um instante.
const INCOMPLETE_GRACE_TRIES = 3;
// Envio que parou por rede com o navegador "online" (sinal fraco, Wi-Fi sem internet, aba suspensa):
// o evento "online" nunca chega, então tenta de novo sozinho nesses intervalos (o último se repete).
const AUTO_RETRY_MS = [5000, 15000, 30000, 60000];

// Lê a duração bruta pelo próprio navegador; sem metadados (codec que o desktop não abre) devolve null.
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
    probe.onloadedmetadata = () => finish(Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : null);
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

// Link interno comum (mesma origem, mesma aba, sem tecla modificadora) que tiraria a pessoa da tela.
function leavingLink(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false; // externo: o beforeunload cobre
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

// Composer de post em vídeo, pensado para o celular: escolher → enviar e escrever → publicado.
// O envio (tus, direto para o Cloudflare) roda em segundo plano enquanto a pessoa escreve.
export function PostComposer({ configured, defaultPillar }: Props) {
  const t = useTranslations("creator.post");
  const te = useTranslations("creator.post.errors");
  const tp = useTranslations("common.pillars");
  const tc = useTranslations("common.actions");
  const tsteps = useTranslations("creator.post.steps");
  const { toast } = useToast();
  const titleId = useId();

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const uploadRef = useRef<Upload | null>(null);
  const sessionRef = useRef<{ contentId: string; uploadUrl: string } | null>(null);
  const fileRef = useRef<{ file: File; durationSec: number | null } | null>(null);
  const pollRef = useRef<number | null>(null);
  const lastQuarterRef = useRef(0);
  const firstStepRef = useRef(true);
  // Entrada extra no histórico que segura o "voltar" enquanto sair perde algo. Controlada por ref:
  // o roteador do Next reescreve history.state a cada action com revalidatePath, então uma marca
  // no estado some e a guarda era empilhada de novo (entradas mortas no voltar do Android).
  const guardRef = useRef({ armed: false, ignorePop: false });
  const leaveRef = useRef<string | null>(null);
  const autoRetryRef = useRef(0);
  // Cada vídeo escolhido (e a saída da tela) ganha uma geração: respostas atrasadas de um vídeo
  // descartado ou de uma tela desmontada são ignoradas.
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
  // Leitor de tela ouve só mudanças de estado (e o envio a cada 25%), não cada ponto percentual.
  const [announcement, setAnnouncement] = useState("");

  const message = useCallback((code: string) => (te.has(code) ? te(code) : te("generic")), [te]);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) window.clearTimeout(pollRef.current);
    pollRef.current = null;
  }, []);

  const updateUpload = useCallback(
    (next: UploadState) => {
      setUpload(next);
      if (next.state === "starting") {
        lastQuarterRef.current = 0;
        setAnnouncement(t("sr.starting"));
      } else if (next.state === "uploading") {
        const quarter = Math.floor(next.pct / 25) * 25;
        if (quarter > lastQuarterRef.current && quarter < 100) {
          lastQuarterRef.current = quarter;
          setAnnouncement(t("sr.progress", { pct: quarter }));
        }
      } else if (next.state === "done") {
        setAnnouncement(t("sr.uploaded"));
      } else if (next.state === "error") {
        setAnnouncement(`${t("sr.error")} ${te.has(next.error) ? te(next.error) : te("generic")}`);
      }
    },
    [t, te],
  );

  // Ao sair da tela: invalida respostas pendentes, para o envio (fica retomável no Cloudflare até
  // o link vencer) e o polling.
  useEffect(() => {
    const generation = generationRef;
    const tus = uploadRef;
    return () => {
      generation.current += 1;
      stopPolling();
      void tus.current?.abort(false).catch(() => undefined);
    };
  }, [stopPolling]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Foco no título da etapa quando ela muda (não na primeira renderização).
  useEffect(() => {
    if (firstStepRef.current) {
      firstStepRef.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const uploadBusy = upload.state === "starting" || upload.state === "uploading";
  const publishBusy = publish.state === "publishing" || publish.state === "processing";
  // Vídeo enviado e texto digitado mas ainda não publicado: título e legenda só são salvos ao
  // publicar, então sair também perde algo (o rascunho fica com o título provisório).
  const unsavedText = step === "compose" && upload.state === "done" && publish.state === "idle" && (title.trim() !== "" || caption.trim() !== "");
  const leaveMessage = uploadBusy ? t("leaveWarning") : publishBusy ? t("leaveWarningProcessing") : unsavedText ? t("leaveWarningText") : null;
  const guarding = leaveMessage !== null;

  useEffect(() => {
    leaveRef.current = leaveMessage;
  }, [leaveMessage]);

  // Voltar do navegador: um listener só, que decide pelos refs. Ao sair da entrada de guarda,
  // confirma; se ficar, empilha de novo; se sair, segue o voltar.
  useEffect(() => {
    const guard = guardRef.current;
    const onPop = () => {
      if (guard.ignorePop) {
        guard.ignorePop = false; // o history.back() que consumiu a guarda
        return;
      }
      if (!guard.armed) return;
      guard.armed = false;
      const leaving = leaveRef.current;
      if (!leaving || window.confirm(leaving)) {
        window.history.back();
        return;
      }
      window.history.pushState(window.history.state, "", window.location.href);
      guard.armed = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Guarda empilhada uma vez enquanto sair perde algo; quando deixa de perder (enviado, erro,
  // publicado, descartado) ela é consumida, senão o 1º "voltar" depois ficava parado na tela.
  useEffect(() => {
    const guard = guardRef.current;
    if (guarding && !guard.armed) {
      window.history.pushState(window.history.state, "", window.location.href);
      guard.armed = true;
    } else if (!guarding && guard.armed) {
      guard.armed = false;
      guard.ignorePop = true;
      window.history.back();
    }
  }, [guarding]);

  // Fechar/recarregar (beforeunload) e links internos do app (clique em captura, antes do roteador).
  useEffect(() => {
    if (!leaveMessage) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = leaveMessage;
      return leaveMessage;
    };
    const onClick = (event: MouseEvent) => {
      if (!leavingLink(event) || window.confirm(leaveMessage)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", onClick, true);
    };
  }, [leaveMessage]);

  const runTus = useCallback(
    async (file: File, uploadUrl: string, generation: number) => {
      const current = () => generation === generationRef.current;
      try {
        const { Upload: TusUpload } = await import("tus-js-client");
        if (!current()) return;
        const tus = new TusUpload(file, {
          uploadUrl,
          chunkSize: CHUNK_SIZE,
          retryDelays: RETRY_DELAYS,
          // O link vem do servidor a cada envio; nada a guardar no navegador.
          storeFingerprintForResuming: false,
          onProgress: (sent, total) => {
            if (!current()) return;
            autoRetryRef.current = 0; // voltou a andar: a próxima queda recomeça do intervalo curto
            updateUpload({ state: "uploading", pct: uploadPercent(sent, total) });
          },
          onSuccess: () => current() && updateUpload({ state: "done" }),
          onError: (error) => current() && updateUpload({ state: "error", error: classifyUploadError(error) }),
        });
        uploadRef.current = tus;
        updateUpload({ state: "uploading", pct: 0 });
        tus.start();
      } catch {
        // Falha ao carregar o cliente tus (rede caiu no meio) ou ao iniciar: nada de ficar em "Preparando…".
        if (current()) updateUpload({ state: "error", error: "network" });
      }
    },
    [updateUpload],
  );

  const beginUpload = useCallback(async () => {
    const picked = fileRef.current;
    if (!picked) return;
    const generation = generationRef.current;
    updateUpload({ state: "starting" });
    let session = sessionRef.current;
    if (!session) {
      try {
        const result = await startVideoPost({ fileSize: picked.file.size, fileName: picked.file.name, durationSec: picked.durationSec });
        if (generation !== generationRef.current) return;
        if (!result.ok) {
          updateUpload({ state: "error", error: result.error });
          return;
        }
        session = { contentId: result.contentId, uploadUrl: result.uploadUrl };
        sessionRef.current = session;
        setContentId(result.contentId);
      } catch {
        if (generation === generationRef.current) updateUpload({ state: "error", error: "network" });
        return;
      }
    }
    await runTus(picked.file, session.uploadUrl, generation);
  }, [runTus, updateUpload]);

  // Envio parado por rede retoma sozinho: no evento "online" (estava offline), ao voltar para a aba
  // e, com o navegador dizendo que está online (sinal fraco, timeout), por tempo.
  const networkDown = upload.state === "error" && upload.error === "network";
  useEffect(() => {
    if (!networkDown) return;
    let done = false;
    const resume = () => {
      if (done) return;
      done = true;
      // anúncio depois do beginUpload: ele anuncia "Preparando" de forma síncrona e o
      // "Retomando" sobrescreveria só se viesse antes (o leitor ouviria que recomeçou do zero)
      void beginUpload();
      setAnnouncement(t("sr.resuming"));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine !== false) resume();
    };
    let timer: number | null = null;
    if (navigator.onLine !== false) {
      const delay = AUTO_RETRY_MS[Math.min(autoRetryRef.current, AUTO_RETRY_MS.length - 1)];
      autoRetryRef.current += 1;
      timer = window.setTimeout(resume, delay);
    }
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      done = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [networkDown, beginUpload, t]);

  async function retryUpload() {
    autoRetryRef.current = 0;
    // Link vencido: o rascunho antigo (e o vídeo incompleto) é descartado e um envio novo começa.
    if (upload.state === "error" && upload.error === "upload_expired" && sessionRef.current) {
      const old = sessionRef.current;
      const generation = generationRef.current;
      sessionRef.current = null;
      setContentId(null);
      updateUpload({ state: "starting" });
      try {
        await discardVideoPost({ contentId: old.contentId });
      } catch {
        // a limpeza diária apaga o que sobrar
      }
      if (generation !== generationRef.current) return;
    }
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
    const generation = generationRef.current;
    setChecking(true);
    const url = URL.createObjectURL(file);
    const rawSeconds = await readDuration(url);
    if (generation !== generationRef.current) {
      URL.revokeObjectURL(url); // a tela saiu (ou outro vídeo entrou) enquanto lia
      return;
    }
    setChecking(false);
    const tooLong = validateDuration(rawSeconds);
    if (tooLong) {
      URL.revokeObjectURL(url);
      setPickError(tooLong);
      return;
    }
    generationRef.current += 1;
    fileRef.current = { file, durationSec: normalizeDuration(rawSeconds) };
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
    void uploadRef.current?.abort(false).catch(() => undefined);
    uploadRef.current = null;
    sessionRef.current = null;
    fileRef.current = null;
    lastQuarterRef.current = 0;
    setPreviewUrl(null);
    setUpload({ state: "idle" });
    setPublish({ state: "idle" });
    setTitle("");
    setCaption("");
    setPillar(defaultPillar);
    setSlug(null);
    setContentId(null);
    setPickError(null);
    setAnnouncement("");
    setStep("pick");
  }

  async function confirmDiscard() {
    setDiscarding(true);
    stopPolling();
    try {
      await uploadRef.current?.abort(false);
    } catch {
      // o descarte apaga o vídeo de qualquer jeito
    }
    const id = contentId;
    let failure: string | null = null;
    if (id) {
      try {
        const result = await discardVideoPost({ contentId: id });
        if (!result.ok) failure = result.error;
      } catch {
        failure = "network";
      }
    }
    setDiscarding(false);
    setDiscardOpen(false);
    if (failure) {
      // Nada foi apagado: a tela fica como estava (o rascunho segue em Meus conteúdos) e o envio
      // interrompido acima volta a andar.
      toast({ title: t("discardFailed"), description: t("discardFailedDescription"), variant: "error" });
      if (upload.state === "starting" || upload.state === "uploading") void beginUpload();
      return;
    }
    reset();
    if (id) toast({ title: t("discarded"), description: t("discardedDeleted"), variant: "success" });
  }

  const trimmedTitle = title.trim();
  const uploadDone = upload.state === "done";
  const publishing = publish.state === "publishing" || publish.state === "processing";
  const canPublish = uploadDone && trimmedTitle.length > 0 && !publishing && contentId !== null;

  async function doPublish() {
    if (!contentId || !canPublish) return;
    const id = contentId;
    // Texto congelado no toque: os campos ficam desabilitados enquanto publica/processa.
    const payload = { contentId: id, title: trimmedTitle, caption: caption.trim(), pillar };
    stopPolling();
    setPublish({ state: "publishing" });
    setAnnouncement(t("sr.publishing"));
    const startedAt = Date.now();
    const generation = generationRef.current;
    let incompleteTries = 0;
    let announcedProcessing = false;
    const attempt = async () => {
      try {
        const result = await publishVideoPost(payload);
        if (generation !== generationRef.current) return;
        if (result.ok) {
          setSlug(result.slug);
          setPublish({ state: "idle" });
          setStep("done");
          return;
        }
        const stillArriving = result.error === "upload_incomplete" && incompleteTries++ < INCOMPLETE_GRACE_TRIES;
        if (result.error === "processing" || stillArriving) {
          // O Cloudflare ainda está recebendo/codificando: tenta de novo a cada 3 s, por até 3 minutos.
          if (Date.now() - startedAt >= POLL_LIMIT_MS) {
            setPublish({ state: "error", error: "processing_timeout" });
            return;
          }
          if (!announcedProcessing) {
            announcedProcessing = true;
            setAnnouncement(t("sr.processing"));
          }
          setPublish({ state: "processing" });
          pollRef.current = window.setTimeout(() => void attempt(), POLL_MS);
          return;
        }
        setPublish({ state: "error", error: result.error });
      } catch {
        // código próprio: "network" fala do envio que retoma sozinho; publicar só retoma no toque
        if (generation === generationRef.current) setPublish({ state: "error", error: "publish_network" });
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
          <StepHeading ref={headingRef} className="text-2xl font-bold text-fg">
            {t("doneTitle")}
          </StepHeading>
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
        <StepHeading ref={headingRef} className="sr-only">
          {tsteps("pick")}
        </StepHeading>
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
      <StepHeading ref={headingRef} className="sr-only">
        {tsteps("compose")}
      </StepHeading>
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="upload-announcer">
        {announcement}
      </p>

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
        <div className="flex flex-col gap-2">
          <ProgressBar value={pct} label={t("uploadLabel")} tone={upload.state === "error" ? "danger" : upload.state === "done" ? "success" : "accent"} />
          <p className={cn("flex items-center gap-2 text-sm", upload.state === "error" ? "text-danger" : "text-fg-muted")} data-testid="upload-status">
            {(upload.state === "starting" || upload.state === "uploading") && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
            {upload.state === "done" && <CircleCheck className="size-4 text-success" aria-hidden="true" />}
            {uploadText}
          </p>
          {(upload.state === "starting" || upload.state === "uploading") && <p className="type-caption text-fg-muted">{t("uploadInBackground")}</p>}
          {upload.state === "error" && (
            <Button type="button" variant="secondary" size="lg" block leadingIcon={<RotateCcw />} onClick={() => void retryUpload()}>
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
        {/* Travado enquanto publica/processa: o polling reenvia o texto do toque, não o que mudar depois. */}
        <fieldset disabled={publishing} className="flex min-w-0 flex-col gap-5" data-testid="post-fields">
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
                <Chip key={p} selected={pillar === p} onClick={() => setPillar(p)} className="min-h-12 px-5 text-base disabled:opacity-55">
                  {tp(p)}
                </Chip>
              ))}
            </div>
          </fieldset>
        </fieldset>

        {publish.state === "processing" && <p className="type-caption text-fg-muted">{t("processingHint")}</p>}
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

// Título da etapa: recebe o foco (tabIndex -1) quando a etapa muda, para o leitor de tela anunciar.
function StepHeading({ ref, className, children }: { ref: Ref<HTMLHeadingElement>; className?: string; children: ReactNode }) {
  return (
    <h2 ref={ref} tabIndex={-1} className={cn("focus:outline-none", className)} data-testid="post-step-heading">
      {children}
    </h2>
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
