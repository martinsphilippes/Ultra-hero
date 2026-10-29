"use client";

import { Camera, Images, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ChangeEvent, type MouseEvent } from "react";
import { removeHeroCover, uploadHeroCover } from "@/app/creator/profile/cover-actions";
import { Button, Dialog, useToast } from "@/components/ui";
import { supabaseBaseUrl } from "@/lib/avatar/paths";
import { AvatarPrepareError, prepareImage, type PreparedAvatar } from "@/lib/avatar/resize";
import { validateSourceFile } from "@/lib/avatar/validation";
import type { HeroCoverState } from "@/lib/hero-cover/availability";
import { COVER_HEIGHT, COVER_MAX_UPLOAD_BYTES, COVER_WIDTH, toCoverError, type CoverError } from "@/lib/hero-cover/constants";
import { safeCoverSrc } from "@/lib/hero-cover/paths";
import { HeroCoverImage } from "./HeroCoverImage";

type Props = {
  /** Capa salva (foto enviada, oficial, desenho antigo ou nenhuma). */
  value: string | null;
  state: HeroCoverState;
  onChange: (next: string | null) => void;
  disabled?: boolean;
};

type Preview = PreparedAvatar & { url: string };

// Capa da página do herói (0042), no mesmo fluxo da foto de perfil: "Tirar foto" (câmera traseira)
// ou "Escolher da galeria", recorte central 16:9 e redução para 1600x900 no aparelho (sem EXIF),
// prévia e confirmação. Só foto real; sem capa, uma superfície lisa do tema.
export function HeroCoverPicker({ value, state, onChange, disabled = false }: Props) {
  const t = useTranslations("creator.profile.cover");
  const { toast } = useToast();
  const router = useRouter();
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
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<CoverError | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();

  const hasCover = safeCoverSrc(value, supabaseBaseUrl()) !== null;
  const ready = state.upload === "ready";
  const busy = disabled || preparing || pending;

  useEffect(() => {
    if (!focusBack || busy || preview || confirmRemove) return;
    const wanted = focusBack === "take" ? takeRef.current : triggerRef.current;
    setFocusBack(null);
    requestAnimationFrame(() => {
      const target = wanted && !wanted.disabled && wanted.isConnected ? wanted : rootRef.current;
      target?.focus();
    });
  }, [focusBack, busy, preview, confirmRemove]);

  // a URL da prévia (blob) é liberada quando a prévia some ou o componente sai da tela
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  function openPicker(event: MouseEvent<HTMLButtonElement>, input: HTMLInputElement | null) {
    triggerRef.current = event.currentTarget;
    input?.click();
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // limpa o input: escolher o mesmo arquivo de novo precisa disparar onChange
    event.target.value = "";
    if (!file) return;
    setError(null);
    setFocusBack("trigger");
    const problem = validateSourceFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setPreparing(true);
    setAnnouncement(t("preparing"));
    try {
      const prepared = await prepareImage(file, { width: COVER_WIDTH, height: COVER_HEIGHT, maxBytes: COVER_MAX_UPLOAD_BYTES });
      setPreview({ ...prepared, url: URL.createObjectURL(prepared.blob) });
      setAnnouncement("");
    } catch (err) {
      setError(err instanceof AvatarPrepareError ? err.code : "decode_failed");
      setAnnouncement("");
    } finally {
      setPreparing(false);
    }
  }

  function closePreview(open: boolean) {
    if (open || pending) return;
    setPreview(null);
    setError(null);
  }

  function confirmUpload() {
    if (!preview) return;
    setError(null);
    setAnnouncement(t("uploading"));
    startTransition(async () => {
      const form = new FormData();
      const ext = preview.mime === "image/webp" ? "webp" : "jpg";
      form.append("file", new File([preview.blob], `capa.${ext}`, { type: preview.mime }));
      let result: Awaited<ReturnType<typeof uploadHeroCover>>;
      try {
        result = await uploadHeroCover(form);
      } catch {
        result = { ok: false, error: "upload_failed" };
      }
      if (!result.ok) {
        setError(toCoverError(result.error));
        setAnnouncement("");
        return;
      }
      setPreview(null);
      onChange(result.coverUrl);
      setAnnouncement(t("uploaded"));
      toast({ title: t("uploaded"), variant: "success" });
      router.refresh();
    });
  }

  function confirmRemoval() {
    setError(null);
    startTransition(async () => {
      // falha de rede rejeita a promessa da action: sem o catch, o erro derrubaria a página inteira
      let result: Awaited<ReturnType<typeof removeHeroCover>>;
      try {
        result = await removeHeroCover();
      } catch {
        result = { ok: false, error: "generic" };
      }
      if (!result.ok) {
        setError(toCoverError(result.error));
        return;
      }
      // "Remover capa" some junto com a capa: o foco vai para "Tirar foto"
      setFocusBack("take");
      setConfirmRemove(false);
      onChange(result.coverUrl);
      setAnnouncement(t("removed"));
      toast({ title: t("removed"), variant: "success" });
      router.refresh();
    });
  }

  const inlineError = error && !preview && !confirmRemove;

  return (
    <section ref={rootRef} tabIndex={-1} aria-labelledby={titleId} className="flex flex-col gap-3 outline-none" data-testid="hero-cover">
      <div className="flex flex-col gap-0.5">
        <h3 id={titleId} className="text-base font-semibold text-fg">
          {t("title")}
        </h3>
        <p className="type-body-sm text-fg-muted">{t("hint")}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated p-4">
        {/* capa atual na proporção gerada (16:9); sem capa, a superfície lisa com um texto discreto */}
        <div className="relative">
          <HeroCoverImage src={value} alt={hasCover ? t("currentAlt") : ""} ratio="video" sizes="(min-width: 640px) 560px, 100vw" className="rounded-lg border border-border" />
          {!hasCover && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center type-body-sm text-fg-subtle" data-testid="hero-cover-none">
              {t("none")}
            </p>
          )}
        </div>

        {!ready && (
          <p role="status" data-testid="hero-cover-unavailable" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-fg">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            {state.upload === "disabled" ? t("disabled") : t("unavailable")}
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="secondary" size="lg" leadingIcon={<Camera />} disabled={!ready || busy} loading={preparing} ref={takeRef} onClick={(e) => openPicker(e, cameraRef.current)}>
            {t("take")}
          </Button>
          <Button type="button" variant="secondary" size="lg" leadingIcon={<Images />} disabled={!ready || busy} onClick={(e) => openPicker(e, galleryRef.current)}>
            {t("gallery")}
          </Button>
        </div>
        {/* Inputs escondidos: o botão é o alvo de toque; capture="environment" abre a câmera traseira. */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} data-testid="hero-cover-camera-input" />
        <input ref={galleryRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} data-testid="hero-cover-gallery-input" />
        {hasCover && (
          <Button type="button" variant="ghost" leadingIcon={<Trash2 />} disabled={!state.canRemove || busy} onClick={() => setConfirmRemove(true)} className="self-start">
            {t("remove")}
          </Button>
        )}
        <p className="type-caption text-fg-subtle">{t("limits")}</p>
        {inlineError && (
          <p role="alert" className="type-caption font-medium text-danger">
            {t(`errors.${error}`)}
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
            <Button type="button" variant="primary" onClick={confirmUpload} loading={pending} data-autofocus>
              {t("use")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 py-2" aria-busy={pending || undefined}>
          {preview && (
            // prévia local (blob): o otimizador de imagens não se aplica
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt={t("previewAlt")} className="aspect-video w-full rounded-lg border border-border object-cover shadow-sm" />
          )}
          {error && preview && (
            <p role="alert" className="text-center type-caption font-medium text-danger">
              {t(`errors.${error}`)}
            </p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={confirmRemove}
        onOpenChange={(open) => {
          if (!pending) {
            setConfirmRemove(open);
            setError(null);
          }
        }}
        title={t("removeConfirmTitle")}
        description={t("removeConfirmBody")}
        size="sm"
        dismissible={!pending}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setConfirmRemove(false);
                setError(null);
              }}
              disabled={pending}
            >
              {t("cancel")}
            </Button>
            <Button type="button" variant="danger" onClick={confirmRemoval} loading={pending}>
              {t("removeConfirm")}
            </Button>
          </>
        }
      >
        {error && confirmRemove ? (
          <p role="alert" className="type-caption font-medium text-danger">
            {t(`errors.${error}`)}
          </p>
        ) : null}
      </Dialog>
    </section>
  );
}
