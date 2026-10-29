"use client";

import { ArrowDown, ArrowUp, CheckCircle2, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";
import { checkRecipeVideo, type RegisteredMedia } from "@/app/creator/recipes/actions";
import { useRecipeErrorText } from "@/components/recipes/portal/use-recipe-error";
import { Button, Dialog, FormField, IconButton, Input } from "@/components/ui";
import { RECIPE_LIMITS } from "@/lib/recipes/codes";
import { fieldIdForPath, MEDIA_GALLERY_SECTION_ID, MEDIA_VIDEO_SECTION_ID } from "@/lib/recipes/editor-steps";
import { recipeMediaUrl } from "@/lib/recipes/media";
import { coerceRecipeLicense, type RecipeVideoProvider } from "@/lib/recipes/payload";
import { parseRecipeVideoLink, recipeVideoLinkText, streamPanel, type StreamUploadPhase } from "@/lib/recipes/video";
import { cn } from "@/lib/utils";
import { RecipeImageUploader } from "../RecipeImageUploader";
import { RecipeVideoUpload } from "../RecipeVideoUpload";
import { StepSection, type StepProps } from "../shared";

type Props = StepProps & {
  contentId: string;
  creatorId: string;
  uploadsEnabled: boolean;
  videoConfigured: boolean;
  onMediaUploaded: (media: RegisteredMedia) => void;
  onDeleteMedia: (mediaId: string) => Promise<boolean>;
  /** Grava o rascunho logo depois de o ticket do Stream existir (o uid não pode ficar só no aparelho). */
  onRequestSave: () => void;
  /** Envio de vídeo em andamento: o assistente segura a troca de etapa (desmontar aborta o envio). */
  onUploadingChange?: (uploading: boolean) => void;
};

type VideoMode = "none" | "link" | "stream";
const modeOf = (provider: RecipeVideoProvider): VideoMode => (provider === "none" ? "none" : provider === "cloudflare_stream" ? "stream" : "link");

// Etapa 4: galeria (até 12, capa primeiro, texto alternativo obrigatório, legenda, reordenação) e
// vídeo opcional por link do YouTube/Vimeo ou envio pelo Cloudflare Stream (fluxo do composer).
export function MediaStep({ draft, setDraft, errorFor, disabled, announce, contentId, creatorId, uploadsEnabled, videoConfigured, onMediaUploaded, onDeleteMedia, onRequestSave, onUploadingChange }: Props) {
  const t = useTranslations("recipes.editor.media");
  const ti = useTranslations("recipes.editor.ingredients");
  const tc = useTranslations("common.actions");
  const errorText = useRecipeErrorText();
  const [mode, setMode] = useState<VideoMode>(modeOf(draft.video.provider));
  const [link, setLink] = useState(recipeVideoLinkText(draft.video.provider, draft.video.ref));
  const [linkError, setLinkError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ id: string; n: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [videoStatus, setVideoStatus] = useState<string | null>(null);
  const [streamPhase, setStreamPhase] = useState<StreamUploadPhase>("idle");

  function changeStreamPhase(next: StreamUploadPhase) {
    setStreamPhase(next);
    onUploadingChange?.(next === "uploading");
  }

  const galleryIdx = draft.media.map((m, i) => (m.role === "gallery" ? i : -1)).filter((i) => i >= 0);
  const galleryFull = galleryIdx.length >= RECIPE_LIMITS.gallery || draft.media.length >= RECIPE_LIMITS.media;

  const updateMedia = (index: number, patch: Partial<(typeof draft.media)[number]>) =>
    setDraft((d) => ({ ...d, media: d.media.map((m, i) => (i === index ? { ...m, ...patch } : m)) }));

  function moveGallery(position: number, to: number) {
    const from = galleryIdx[position];
    const target = galleryIdx[to];
    if (from === undefined || target === undefined) return;
    setDraft((d) => {
      const media = d.media.slice();
      [media[from], media[target]] = [media[target], media[from]];
      return { ...d, media };
    });
    announce(ti("moved", { label: t("photo", { n: position + 1 }), n: to + 1, total: galleryIdx.length }));
  }

  function setVideo(provider: RecipeVideoProvider, ref: string | null) {
    setDraft((d) => ({ ...d, video: { provider, ref }, videoDirty: true, licenseKind: coerceRecipeLicense(provider, d.licenseKind) }));
  }

  function changeMode(next: VideoMode) {
    // sair do modo de envio desmonta o envio (abortado de propósito): libera a navegação
    if (next !== "stream" && streamPhase !== "idle") changeStreamPhase("idle");
    setMode(next);
    setLinkError(null);
    if (next === "none") setVideo("none", null);
    if (next === "link") {
      const parsed = parseRecipeVideoLink(link);
      if (parsed) setVideo(parsed.provider, parsed.ref);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    try {
      await onDeleteMedia(removing.id);
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  }

  async function checkVideo() {
    setVideoStatus(null);
    try {
      const result = await checkRecipeVideo({ contentId });
      setVideoStatus(result.ok ? t("videoReady") : errorText(result.error));
    } catch {
      setVideoStatus(errorText("network"));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <StepSection id={MEDIA_GALLERY_SECTION_ID} title={t("galleryTitle")}>
        <p className="-mt-2 type-body-sm text-fg-muted">{t("galleryHint")}</p>
        {galleryIdx.length === 0 && <p className="type-body-sm text-fg-muted">{t("noPhotos")}</p>}
        <ol className="flex flex-col gap-3" data-testid="gallery-list">
          {galleryIdx.map((mediaIndex, position) => {
            const m = draft.media[mediaIndex];
            const base = `media.${mediaIndex}`;
            const isCover = draft.coverMediaId === m.id;
            return (
              <li key={m.id} className={cn("flex flex-col gap-3 rounded-xl border p-3 sm:flex-row", isCover ? "border-accent" : "border-border")} data-testid="gallery-item">
                <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-lg border border-border bg-surface-elevated sm:w-40">
                  <Image src={recipeMediaUrl(m.id)} alt={m.alt} fill unoptimized sizes="160px" className="object-cover" />
                  {isCover && (
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-fg">
                      <Star className="size-3" aria-hidden="true" />
                      {t("cover")}
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <FormField id={fieldIdForPath(`${base}.alt_text`)} label={`${t("alt")} · ${t("photo", { n: position + 1 })}`} hint={t("altHint")} error={errorFor(`${base}.alt_text`)} required>
                    <Input value={m.alt} maxLength={200} onChange={(e) => updateMedia(mediaIndex, { alt: e.target.value })} disabled={disabled} />
                  </FormField>
                  <FormField id={fieldIdForPath(`${base}.caption`)} label={t("caption")} error={errorFor(`${base}.caption`)}>
                    <Input value={m.caption} maxLength={200} onChange={(e) => updateMedia(mediaIndex, { caption: e.target.value })} disabled={disabled} />
                  </FormField>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button type="button" variant={isCover ? "secondary" : "ghost"} leadingIcon={isCover ? <CheckCircle2 /> : <Star />} aria-pressed={isCover} disabled={disabled} onClick={() => setDraft((d) => ({ ...d, coverMediaId: m.id }))}>
                      {isCover ? t("cover") : t("setCover")}
                    </Button>
                    <IconButton label={ti("moveUp", { label: t("photo", { n: position + 1 }) })} icon={<ArrowUp />} disabled={disabled || position === 0} onClick={() => moveGallery(position, position - 1)} />
                    <IconButton label={ti("moveDown", { label: t("photo", { n: position + 1 }) })} icon={<ArrowDown />} disabled={disabled || position === galleryIdx.length - 1} onClick={() => moveGallery(position, position + 1)} />
                    <IconButton label={t("removePhoto", { n: position + 1 })} icon={<Trash2 />} disabled={disabled} onClick={() => setRemoving({ id: m.id, n: position + 1 })} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        {!uploadsEnabled ? (
          <p role="status" className="type-body-sm text-warning">
            {t("uploadsDisabled")}
          </p>
        ) : galleryFull ? (
          <p className="type-body-sm text-fg-muted">{t("galleryFull")}</p>
        ) : (
          <RecipeImageUploader
            contentId={contentId}
            creatorId={creatorId}
            role="gallery"
            disabled={disabled}
            onUploaded={(media) => {
              onMediaUploaded(media);
              // primeira foto vira capa (a pessoa troca depois)
              setDraft((d) => (d.coverMediaId ? d : { ...d, coverMediaId: media.id }));
            }}
          />
        )}
      </StepSection>

      <StepSection id={MEDIA_VIDEO_SECTION_ID} title={t("videoTitle")}>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-fg">{t("videoKind")}</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {(["none", "link", "stream"] as const).map((m) => (
              <label key={m} className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm", mode === m ? "border-accent bg-accent-soft text-fg" : "border-border-strong text-fg-muted")}>
                <input type="radio" name="recipe-video-mode" value={m} checked={mode === m} onChange={() => changeMode(m)} disabled={disabled} className="size-4 accent-[var(--color-accent)]" />
                {m === "none" ? t("videoNone") : m === "link" ? t("videoLink") : t("videoStream")}
              </label>
            ))}
          </div>
        </fieldset>
        {mode === "link" && (
          <FormField id={fieldIdForPath("video.ref")} label={t("videoLinkLabel")} hint={t("videoLinkHint")} error={linkError ?? errorFor("video.ref")}>
            <Input
              type="url"
              inputMode="url"
              value={link}
              maxLength={300}
              placeholder="https://www.youtube.com/watch?v=…"
              disabled={disabled}
              onChange={(e) => {
                const value = e.target.value;
                setLink(value);
                const parsed = parseRecipeVideoLink(value);
                if (parsed) {
                  setLinkError(null);
                  setVideo(parsed.provider, parsed.ref);
                } else {
                  setLinkError(value.trim() ? t("videoLinkInvalid") : null);
                  if (!value.trim()) setVideo("none", null);
                }
              }}
            />
          </FormField>
        )}
        {mode === "link" && (draft.video.provider === "embed_youtube" || draft.video.provider === "embed_vimeo") && !linkError ? (
          <p className="type-caption text-success">{t("videoLinkOk", { provider: t(`providers.${draft.video.provider}`) })}</p>
        ) : null}
        {mode === "stream" &&
          (streamPanel(draft.video, streamPhase) === "current" ? (
            <div className="flex flex-col gap-2">
              <p className="type-body-sm text-fg">{t("videoCurrentStream")}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={checkVideo} disabled={disabled}>
                  {t("videoCheck")}
                </Button>
                <Button type="button" variant="ghost" leadingIcon={<Trash2 />} onClick={() => changeMode("none")} disabled={disabled}>
                  {t("videoRemove")}
                </Button>
              </div>
              {videoStatus && <p className="type-body-sm text-fg-muted" role="status">{videoStatus}</p>}
            </div>
          ) : videoConfigured ? (
            <RecipeVideoUpload
              contentId={contentId}
              disabled={disabled}
              onStarted={(uid) => {
                changeStreamPhase("uploading");
                setVideoStatus(null);
                setVideo("cloudflare_stream", uid);
                onRequestSave();
              }}
              onFinished={(ok) => {
                changeStreamPhase(ok ? "idle" : "failed");
                if (ok) setVideoStatus(t("videoUploaded"));
              }}
            />
          ) : (
            <p role="status" className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 type-body-sm text-fg" data-testid="recipe-video-not-configured">
              {t("videoNotConfigured")}
            </p>
          ))}
      </StepSection>

      {removing && (
        <Dialog
          open
          onOpenChange={(next) => !next && !busy && setRemoving(null)}
          title={t("removeTitle", { n: removing.n })}
          description={t("removeDescription")}
          size="sm"
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setRemoving(null)} disabled={busy}>
                {tc("cancel")}
              </Button>
              <Button type="button" variant="danger" loading={busy} onClick={confirmRemove}>
                {t("removePhoto", { n: removing.n })}
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}
