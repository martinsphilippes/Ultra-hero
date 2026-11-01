"use client";

import { Camera, Images, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useId, useRef, useState, useTransition, type ChangeEvent, type MouseEvent } from "react";
import { uploadContentCover, type ContentCoverError } from "@/app/admin/content/cover-actions";
import { UploadRightsDialog } from "@/components/creator/UploadRightsDialog";
import { Button, Dialog } from "@/components/ui";
import { supabaseBaseUrl } from "@/lib/avatar/paths";
import { AvatarPrepareError, prepareFittedImage, type PreparedFitted } from "@/lib/avatar/resize";
import { POST_PHOTO_MAX_EDGE, POST_PHOTO_MAX_UPLOAD_BYTES, type PostPhotoState } from "@/lib/post-photo/constants";
import { storedPostPhotoPath } from "@/lib/post-photo/paths";
import { mediaKindOf, validatePhotoSource } from "@/lib/post-photo/validation";
import { VideoFrameError, frameFromVideo } from "@/lib/post-photo/video-frame";
import { UPLOAD_RIGHTS_REQUIRED } from "@/lib/partner-terms/version";
import { SAME_ORIGIN_PATH } from "./schema";

export type CoverPickerProps = {
  /** Capa salva no formulário ("" = nenhuma). */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  /** Envio de foto (kill switch e service role), lido no servidor. */
  state: PostPhotoState;
  /** Herói escolhido no editor: a capa é reservada em nome dele (obrigatório para enviar). */
  creatorId: string | null;
  disabled?: boolean;
};

type Preview = PreparedFitted & { url: string };
type PickerError = ContentCoverError | "decode_failed" | "not_media";

/** A capa pode ser mostrada? Só caminho da própria plataforma ou foto do bucket deste projeto. */
export function coverPreviewSrc(value: string, baseUrl: string | null): string | null {
  if (value === "") return null;
  if (SAME_ORIGIN_PATH.test(value)) return value;
  return storedPostPhotoPath(value, baseUrl) !== null ? value : null;
}

// Capa do conteúdo: "Tirar foto" (câmera traseira) ou "Escolher do celular" (foto ou vídeo da galeria;
// de um vídeo sai um quadro). A foto é reduzida no aparelho (até 2048 px, sem EXIF), tem prévia e só
// sobe depois de confirmada; o formulário guarda a URL e grava ao salvar. Sem capa padrão nem caminho.
export function CoverPicker({ value, onChange, error, state, creatorId, disabled = false }: CoverPickerProps) {
  const t = useTranslations("editors.cover");
  const titleId = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const takeRef = useRef<HTMLButtonElement>(null);
  // Botão que abriu o fluxo: ao fim (prévia fechada, erro, capa enviada ou removida) o foco volta para cá.
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [focusBack, setFocusBack] = useState<"trigger" | "take" | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [pickError, setPickError] = useState<PickerError | null>(null);
  const [rightsOpen, setRightsOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();

  const src = coverPreviewSrc(value, supabaseBaseUrl());
  const ready = state === "ready";
  const busy = disabled || preparing || pending;

  useEffect(() => {
    if (!focusBack || busy || preview) return;
    const wanted = focusBack === "take" ? takeRef.current : triggerRef.current;
    setFocusBack(null);
    requestAnimationFrame(() => {
      const target = wanted && !wanted.disabled && wanted.isConnected ? wanted : rootRef.current;
      target?.focus();
    });
  }, [focusBack, busy, preview]);

  // a URL da prévia (blob) é liberada quando a prévia some ou o componente sai da tela
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  function openPicker(event: MouseEvent<HTMLButtonElement>, input: HTMLInputElement | null) {
    triggerRef.current = event.currentTarget;
    if (!creatorId) {
      setPickError("creator_required");
      return;
    }
    input?.click();
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // limpa o input: escolher o mesmo arquivo de novo precisa disparar onChange
    event.target.value = "";
    if (!file) return;
    setPickError(null);
    setFocusBack("trigger");
    const kind = mediaKindOf(file);
    if (!kind) {
      setPickError("not_media");
      return;
    }
    setPreparing(true);
    setAnnouncement(t(kind === "video" ? "preparingVideo" : "preparing"));
    try {
      let source: Blob = file;
      if (kind === "video") {
        // o vídeo fica no aparelho: só um quadro vira a capa
        source = await frameFromVideo(file);
      } else {
        const problem = validatePhotoSource(file);
        if (problem) {
          setPickError(problem);
          return;
        }
      }
      const prepared = await prepareFittedImage(source, { maxEdge: POST_PHOTO_MAX_EDGE, maxBytes: POST_PHOTO_MAX_UPLOAD_BYTES });
      setPreview({ ...prepared, url: URL.createObjectURL(prepared.blob) });
    } catch (err) {
      setPickError(err instanceof AvatarPrepareError || err instanceof VideoFrameError ? err.code : "decode_failed");
    } finally {
      setPreparing(false);
      setAnnouncement("");
    }
  }

  function closePreview(open: boolean) {
    if (open || pending) return;
    setPreview(null);
    setPickError(null);
  }

  function confirmUpload() {
    if (!preview || !creatorId) return;
    setPickError(null);
    setAnnouncement(t("uploading"));
    startTransition(async () => {
      const form = new FormData();
      form.append("creatorId", creatorId);
      form.append("file", new File([preview.blob], preview.mime === "image/webp" ? "capa.webp" : "capa.jpg", { type: preview.mime }));
      let result: Awaited<ReturnType<typeof uploadContentCover>>;
      try {
        result = await uploadContentCover(form);
      } catch {
        result = { ok: false, error: "upload_failed" };
      }
      if (!result.ok) {
        // primeiro envio sem a declaração de direitos: pede a confirmação e envia de novo
        if (result.error === UPLOAD_RIGHTS_REQUIRED) setRightsOpen(true);
        else setPickError(result.error);
        setAnnouncement("");
        return;
      }
      setPreview(null);
      onChange(result.coverUrl);
      setAnnouncement(t("uploaded"));
    });
  }

  function remove() {
    setPickError(null);
    setFocusBack("take");
    onChange("");
    setAnnouncement(t("removed"));
  }

  const inlineError = pickError && !preview ? pickError : null;

  return (
    <div ref={rootRef} tabIndex={-1} aria-labelledby={titleId} className="flex flex-col gap-3 outline-none" data-testid="content-cover">
      <span id={titleId} className="sr-only">
        {t("title")}
      </span>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated p-4">
        {/* capa atual (proporção livre, como a foto do post); sem capa, uma superfície lisa com um texto discreto */}
        <div className="relative overflow-hidden rounded-lg border border-border bg-surface">
          {src ? (
            <Image src={src} alt={t("currentAlt")} width={1024} height={768} unoptimized className="max-h-80 w-full object-contain" data-testid="content-cover-image" />
          ) : (
            <p className="flex aspect-video items-center justify-center px-4 text-center type-body-sm text-fg-subtle" data-testid="content-cover-none">
              {t("none")}
            </p>
          )}
        </div>

        {!ready && (
          <p role="status" data-testid="content-cover-unavailable" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-fg">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            {state === "disabled" ? t("disabled") : t("unavailable")}
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="secondary" size="lg" leadingIcon={<Camera />} disabled={!ready || busy} loading={preparing} ref={takeRef} onClick={(e) => openPicker(e, cameraRef.current)} data-testid="content-cover-take">
            {t("take")}
          </Button>
          <Button type="button" variant="secondary" size="lg" leadingIcon={<Images />} disabled={!ready || busy} onClick={(e) => openPicker(e, galleryRef.current)} data-testid="content-cover-gallery">
            {t("gallery")}
          </Button>
        </div>
        {/* Inputs escondidos: o botão é o alvo de toque; capture="environment" abre a câmera traseira. */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFile(e)} data-testid="content-cover-camera-input" />
        <input ref={galleryRef} type="file" accept="image/*,video/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFile(e)} data-testid="content-cover-gallery-input" />
        {value !== "" && (
          <Button type="button" variant="ghost" leadingIcon={<Trash2 />} disabled={busy} onClick={remove} className="self-start" data-testid="content-cover-remove">
            {t("remove")}
          </Button>
        )}
        <p className="type-caption text-fg-subtle">{t("limits")}</p>
        {(inlineError || error) && (
          <p role="alert" className="type-caption font-medium text-danger">
            {inlineError ? t(`errors.${inlineError}`) : error}
          </p>
        )}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>

      <Dialog
        open={preview !== null}
        onOpenChange={closePreview}
        title={t("previewTitle")}
        description={t("previewDescription")}
        size="md"
        dismissible={!pending}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => closePreview(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="primary" onClick={confirmUpload} loading={pending} data-autofocus data-testid="content-cover-use">
              {t("use")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 py-2" aria-busy={pending || undefined}>
          {preview && (
            // prévia local (blob): o otimizador de imagens não se aplica
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt={t("previewAlt")} className="max-h-96 w-full rounded-lg border border-border object-contain shadow-sm" />
          )}
          {pickError && preview && (
            <p role="alert" className="text-center type-caption font-medium text-danger">
              {t(`errors.${pickError}`)}
            </p>
          )}
        </div>
      </Dialog>

      <UploadRightsDialog open={rightsOpen} onOpenChange={setRightsOpen} onConfirmed={confirmUpload} />
    </div>
  );
}
