"use client";

import { Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { replaceVideoPost } from "@/app/heroi/post/actions";
import { normalizeDuration, uploadPercent, validateDuration, validateVideoFile } from "@/components/creator/post/validation";
import { Button, ProgressBar, useToast } from "@/components/ui";

const CHUNK_SIZE = 8 * 1024 * 1024;
const RETRY_DELAYS = [0, 3000, 5000, 10000];

// Duração lida pelo próprio navegador (sem metadados devolve null; o servidor aceita e o Cloudflare limita).
function readDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.muted = true;
    const timer = window.setTimeout(() => resolve(null), 10_000);
    probe.onloadedmetadata = () => {
      window.clearTimeout(timer);
      resolve(Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : null);
    };
    probe.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    probe.src = url;
  });
}

// Vídeo do post em rascunho (depois de despublicar ou desarquivar): troca por outro da galeria ou da câmera. Mesmas
// regras do envio novo (tamanho e duração); o envio vai direto do navegador ao Cloudflare, com progresso.
export function ReplacePostVideo({ contentId }: { contentId: string }) {
  const t = useTranslations("creator.publish.video");
  const te = useTranslations("creator.errors");
  const { toast } = useToast();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorText = (code: string) => {
    const key = code.split(":")[0].trim();
    return te.has(key) ? te(key) : te("generic");
  };

  async function onFile(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    setError(null);
    const problem = validateVideoFile(file);
    if (problem) return setError(errorText(problem));
    const url = URL.createObjectURL(file);
    const raw = await readDuration(url);
    URL.revokeObjectURL(url);
    const tooLong = validateDuration(raw);
    if (tooLong) return setError(errorText(tooLong));

    setPct(0);
    const result = await replaceVideoPost({ contentId, fileSize: file.size, fileName: file.name, durationSec: normalizeDuration(raw) });
    if (!result.ok) {
      setPct(null);
      return setError(errorText(result.error));
    }
    try {
      const { Upload } = await import("tus-js-client");
      const tus = new Upload(file, {
        uploadUrl: result.uploadUrl,
        chunkSize: CHUNK_SIZE,
        retryDelays: RETRY_DELAYS,
        storeFingerprintForResuming: false,
        onProgress: (sent, total) => setPct(uploadPercent(sent, total)),
        onSuccess: () => {
          setPct(null);
          toast({ title: t("changed"), variant: "success" });
          router.refresh();
        },
        onError: () => {
          setPct(null);
          setError(t("failed"));
        },
      });
      tus.start();
    } catch {
      setPct(null);
      setError(t("failed"));
    }
  }

  const busy = pct !== null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="replace-post-video">
      <div>
        <h2 className="type-h3 text-fg">{t("title")}</h2>
        <p className="type-body-sm text-fg-muted">{t("description")}</p>
      </div>
      <input ref={input} type="file" accept="video/*" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} aria-label={t("change")} />
      <div>
        <Button type="button" variant="secondary" leadingIcon={<Video />} loading={busy} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? t("sending", { pct: pct ?? 0 }) : t("change")}
        </Button>
      </div>
      {busy ? <ProgressBar value={pct ?? 0} label={t("sending", { pct: pct ?? 0 })} /> : null}
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
