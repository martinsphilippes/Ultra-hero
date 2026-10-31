"use client";

import { Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { Upload } from "tus-js-client";
import { startRecipeVideoUpload } from "@/app/creator/recipes/actions";
import { normalizeDuration, uploadPercent, validateDuration, validateVideoFile } from "@/components/creator/post/validation";
import { useRecipeErrorText } from "@/components/recipes/portal/use-recipe-error";
import { UploadRightsDialog } from "@/components/creator/UploadRightsDialog";
import { Button, ProgressBar } from "@/components/ui";
import { UPLOAD_RIGHTS_REQUIRED } from "@/lib/partner-terms/version";

// Mesmos parâmetros do composer de post (PostComposer): pedaços de 50 MB e novas tentativas.
const CHUNK_SIZE = 50 * 1024 * 1024;
const RETRY_DELAYS = [0, 3000, 10000, 20000];

function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.onloadedmetadata = () => done(normalizeDuration(video.duration));
    video.onerror = () => done(null);
    video.src = url;
  });
}

type Props = {
  contentId: string;
  disabled?: boolean;
  onStarted: (uid: string) => void;
  /** Fim do envio iniciado em onStarted (true = arquivo inteiro no Cloudflare). */
  onFinished?: (ok: boolean) => void;
};

// Envio de vídeo da receita pelo Cloudflare Stream, no mesmo fluxo do composer: o servidor cria o
// ticket (tus) já ligado à receita em stream_uploads; o arquivo vai direto do aparelho ao Cloudflare.
// O uid entra no rascunho assim que o ticket existe (onStarted); o processamento termina depois.
export function RecipeVideoUpload({ contentId, disabled = false, onStarted, onFinished }: Props) {
  const t = useTranslations("recipes.editor.media");
  const te = useTranslations("creator.post.errors");
  const errorText = useRecipeErrorText();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<Upload | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // primeiro vídeo sem a declaração de direitos (Termos do Parceiro): confirma e envia o mesmo arquivo
  const [rightsFile, setRightsFile] = useState<File | null>(null);

  useEffect(() => () => void uploadRef.current?.abort(false).catch(() => undefined), []);

  // fechar ou recarregar a aba no meio do envio perde o vídeo: o navegador pede confirmação
  useEffect(() => {
    if (pct === null) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pct]);

  const message = (code: string) => (te.has(code) ? te(code) : errorText(code));

  async function onFile(file: File) {
    setError(null);
    setDone(false);
    const problem = validateVideoFile(file);
    if (problem) {
      setError(message(problem));
      return;
    }
    const durationSec = await readDuration(file);
    if (validateDuration(durationSec)) {
      setError(message("too_long"));
      return;
    }
    setPct(0);
    let started = false;
    try {
      const result = await startRecipeVideoUpload({ contentId, fileSize: file.size, fileName: file.name, durationSec });
      if (!result.ok) {
        setPct(null);
        if (result.error === UPLOAD_RIGHTS_REQUIRED) setRightsFile(file);
        else setError(message(result.error));
        return;
      }
      onStarted(result.uid);
      started = true;
      const { Upload: TusUpload } = await import("tus-js-client");
      const tus = new TusUpload(file, {
        uploadUrl: result.uploadUrl,
        chunkSize: CHUNK_SIZE,
        retryDelays: RETRY_DELAYS,
        storeFingerprintForResuming: false,
        onProgress: (sent, total) => setPct(uploadPercent(sent, total)),
        onSuccess: () => {
          setPct(null);
          setDone(true);
          onFinished?.(true);
        },
        onError: () => {
          setPct(null);
          setError(message("upload_failed"));
          onFinished?.(false);
        },
      });
      uploadRef.current = tus;
      tus.start();
    } catch {
      setPct(null);
      setError(message("network"));
      if (started) onFinished?.(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
          e.target.value = "";
        }}
      />
      <div>
        <Button type="button" variant="secondary" leadingIcon={<Video />} disabled={disabled || pct !== null} onClick={() => inputRef.current?.click()}>
          {t("videoChoose")}
        </Button>
      </div>
      <p className="type-caption text-fg-muted">{t("videoStreamHint")}</p>
      {pct !== null && <ProgressBar value={pct} label={t("videoUploading", { pct })} />}
      <p className="sr-only" aria-live="polite">
        {pct !== null ? t("videoUploading", { pct }) : done ? t("videoUploaded") : ""}
      </p>
      {done && <p className="type-body-sm text-success">{t("videoUploaded")}</p>}
      {error && (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      )}
      <UploadRightsDialog
        open={rightsFile !== null}
        onOpenChange={(open) => !open && setRightsFile(null)}
        onConfirmed={() => {
          const file = rightsFile;
          setRightsFile(null);
          if (file) void onFile(file);
        }}
      />
    </div>
  );
}
