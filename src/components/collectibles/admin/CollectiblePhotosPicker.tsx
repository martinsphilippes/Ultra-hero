"use client";

import { Camera, Images, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useId, useRef, useState, useTransition, type ChangeEvent, type MouseEvent } from "react";
import { uploadCollectiblePhoto, type CollectiblePhotoError } from "@/app/admin/collectibles/photo-actions";
import { UploadRightsDialog } from "@/components/creator/UploadRightsDialog";
import { Button, Dialog, IconButton } from "@/components/ui";
import { AvatarPrepareError, prepareFittedImage, type PreparedFitted } from "@/lib/avatar/resize";
import { POST_PHOTO_MAX_EDGE, POST_PHOTO_MAX_UPLOAD_BYTES, type PostPhotoState } from "@/lib/post-photo/constants";
import { validatePhotoSource } from "@/lib/post-photo/validation";
import { UPLOAD_RIGHTS_REQUIRED } from "@/lib/partner-terms/version";

export const COLLECTIBLE_PHOTOS_MAX = 8;

type Props = {
  photos: string[];
  onChange: (photos: string[]) => void;
  /** Envio de foto (kill switch e service role), lido no servidor. */
  state: PostPhotoState;
  disabled?: boolean;
  error?: string;
};

type Preview = PreparedFitted & { url: string };
type PickerError = CollectiblePhotoError | "decode_failed" | "max_photos";

// Fotos do colecionável (até 8): "Tirar foto" (câmera traseira) ou "Escolher do celular" (galeria). A
// foto é reduzida no aparelho (até 2048 px, sem EXIF), tem prévia e só sobe depois de confirmada; a
// lista de URLs fica no formulário e é gravada ao salvar. A primeira foto é a capa do item.
export function CollectiblePhotosPicker({ photos, onChange, state, disabled = false, error }: Props) {
  const t = useTranslations("collectibles.admin.photos");
  const labelId = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [focusBack, setFocusBack] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [pickError, setPickError] = useState<PickerError | null>(null);
  const [rightsOpen, setRightsOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();

  const ready = state === "ready";
  const full = photos.length >= COLLECTIBLE_PHOTOS_MAX;
  const busy = disabled || preparing || pending;

  useEffect(() => {
    if (!focusBack || busy || preview) return;
    setFocusBack(false);
    const wanted = triggerRef.current;
    requestAnimationFrame(() => {
      const target = wanted && !wanted.disabled && wanted.isConnected ? wanted : rootRef.current;
      target?.focus();
    });
  }, [focusBack, busy, preview]);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  function openPicker(event: MouseEvent<HTMLButtonElement>, input: HTMLInputElement | null) {
    triggerRef.current = event.currentTarget;
    if (full) {
      setPickError("max_photos");
      return;
    }
    input?.click();
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPickError(null);
    setFocusBack(true);
    const problem = validatePhotoSource(file);
    if (problem) {
      setPickError(problem);
      return;
    }
    setPreparing(true);
    setAnnouncement(t("preparing"));
    try {
      const prepared = await prepareFittedImage(file, { maxEdge: POST_PHOTO_MAX_EDGE, maxBytes: POST_PHOTO_MAX_UPLOAD_BYTES });
      setPreview({ ...prepared, url: URL.createObjectURL(prepared.blob) });
    } catch (err) {
      setPickError(err instanceof AvatarPrepareError ? err.code : "decode_failed");
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
    if (!preview) return;
    setPickError(null);
    setAnnouncement(t("uploading"));
    startTransition(async () => {
      const form = new FormData();
      form.append("file", new File([preview.blob], preview.mime === "image/webp" ? "foto.webp" : "foto.jpg", { type: preview.mime }));
      let result: Awaited<ReturnType<typeof uploadCollectiblePhoto>>;
      try {
        result = await uploadCollectiblePhoto(form);
      } catch {
        result = { ok: false, error: "upload_failed" };
      }
      if (!result.ok) {
        if (result.error === UPLOAD_RIGHTS_REQUIRED) setRightsOpen(true);
        else setPickError(result.error);
        setAnnouncement("");
        return;
      }
      setPreview(null);
      onChange([...photos, result.url].slice(0, COLLECTIBLE_PHOTOS_MAX));
      setAnnouncement(t("uploaded"));
    });
  }

  function remove(index: number) {
    setPickError(null);
    onChange(photos.filter((_, i) => i !== index));
    setAnnouncement(t("removed"));
  }

  const inlineError = pickError && !preview ? t(`errors.${pickError}`) : error;

  return (
    <div ref={rootRef} tabIndex={-1} role="group" aria-labelledby={labelId} className="flex flex-col gap-3 outline-none" data-testid="collectible-photos">
      <span id={labelId} className="text-sm font-medium text-fg">
        {t("label")}
      </span>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated p-4">
        {photos.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={t("listLabel")}>
            {photos.map((src, index) => (
              <li key={`${src}-${index}`} className="relative aspect-square overflow-hidden rounded-lg border border-border bg-surface" data-testid="collectible-photo">
                <Image src={src} alt={t("photoAlt", { n: index + 1 })} fill unoptimized sizes="120px" className="object-cover" />
                {index === 0 ? <span className="absolute bottom-1 left-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">{t("coverTag")}</span> : null}
                <IconButton
                  label={t("remove", { n: index + 1 })}
                  icon={<X />}
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => remove(index)}
                  className="absolute right-1 top-1 bg-black/60 text-white hover:bg-black/80"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex aspect-video items-center justify-center rounded-lg border border-border bg-surface px-4 text-center type-body-sm text-fg-subtle" data-testid="collectible-photos-none">
            {t("none")}
          </p>
        )}

        {!ready && (
          <p role="status" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-fg">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            {state === "disabled" ? t("disabled") : t("unavailable")}
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="secondary" size="lg" leadingIcon={<Camera />} disabled={!ready || busy} loading={preparing} onClick={(e) => openPicker(e, cameraRef.current)} data-testid="collectible-photos-take">
            {t("take")}
          </Button>
          <Button type="button" variant="secondary" size="lg" leadingIcon={<Images />} disabled={!ready || busy} onClick={(e) => openPicker(e, galleryRef.current)} data-testid="collectible-photos-gallery">
            {t("gallery")}
          </Button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFile(e)} data-testid="collectible-photos-camera-input" />
        <input ref={galleryRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFile(e)} data-testid="collectible-photos-gallery-input" />
        <p className="type-caption text-fg-subtle">{t("limits", { count: photos.length, max: COLLECTIBLE_PHOTOS_MAX })}</p>
        {inlineError && (
          <p role="alert" className="type-caption font-medium text-danger">
            {inlineError}
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
            <Button type="button" variant="primary" onClick={confirmUpload} loading={pending} data-autofocus data-testid="collectible-photos-use">
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
