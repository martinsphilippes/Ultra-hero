"use client";

import { ImagePlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { registerRecipeMedia, type RegisteredMedia } from "@/app/creator/recipes/actions";
import { useRecipeErrorText } from "@/components/recipes/portal/use-recipe-error";
import { Button, Checkbox, FormField, Input, ProgressBar } from "@/components/ui";
import { RECIPE_MEDIA_BUCKET, recipeMediaPath } from "@/lib/recipes/media";
import { createClient } from "@/lib/supabase/client";
import { prepareRecipeImage } from "./prepare-image";

type Stage = "idle" | "preparing" | "uploading" | "registering";
type Props = {
  contentId: string;
  creatorId: string;
  role: "gallery" | "step";
  disabled?: boolean;
  /** Pede o texto alternativo junto (galeria); na foto de etapa ele é opcional. */
  askAlt?: boolean;
  onUploaded: (media: RegisteredMedia) => void;
};

const STAGE_PCT: Record<Stage, number> = { idle: 0, preparing: 20, uploading: 55, registering: 85 };

// Envio de foto da receita: reduz no navegador (sem EXIF), envia direto ao bucket privado
// recipe-media com a sessão do herói (políticas da 0028: pasta própria, rascunho próprio, cota) e
// registra pela action, que confere os bytes e chama recipe_register_media.
export function RecipeImageUploader({ contentId, creatorId, role, disabled = false, askAlt = true, onUploaded }: Props) {
  const t = useTranslations("recipes.editor.uploader");
  const errorText = useRecipeErrorText();
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const [rights, setRights] = useState(false);
  const [alt, setAlt] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const busy = stage !== "idle";

  async function onFile(file: File) {
    setError(null);
    setStage("preparing");
    setStatus(t("preparing"));
    try {
      const prepared = await prepareRecipeImage(file);
      if ("error" in prepared) {
        setError(t(`errors.${prepared.error}`));
        return;
      }
      setStage("uploading");
      setStatus(t("uploading"));
      const path = recipeMediaPath(creatorId, contentId, crypto.randomUUID(), prepared.mime);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from(RECIPE_MEDIA_BUCKET).upload(path, prepared.blob, { upsert: false, contentType: prepared.mime });
      if (uploadError) {
        // a política do Storage recusa sem dizer o motivo (cota, pasta, rascunho): mensagem única
        setError(/fetch|network/i.test(uploadError.message) ? t("errors.network") : t("errors.upload_rejected"));
        return;
      }
      setStage("registering");
      setStatus(t("registering"));
      const result = await registerRecipeMedia({ contentId, path, role, alt, rights: true, width: prepared.width, height: prepared.height });
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      onUploaded(result.media);
      setAlt("");
      setStatus(t("done"));
    } catch {
      setError(t("errors.network"));
    } finally {
      setStage("idle");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border-strong p-3" data-testid={`recipe-uploader-${role}`}>
      {askAlt && (
        <FormField label={t("altLabel")}>
          <Input value={alt} maxLength={200} placeholder={t("altPlaceholder")} onChange={(e) => setAlt(e.target.value)} disabled={disabled || busy} />
        </FormField>
      )}
      <Checkbox id={`${baseId}-rights`} checked={rights} onChange={(e) => setRights(e.target.checked)} label={t("rights")} description={t("rightsHint")} disabled={disabled || busy} />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
        data-testid={`recipe-file-${role}`}
      />
      <div>
        <Button type="button" variant="secondary" leadingIcon={<ImagePlus />} disabled={disabled || busy || !rights} loading={busy} onClick={() => inputRef.current?.click()}>
          {role === "gallery" ? t("choose") : t("chooseStep")}
        </Button>
      </div>
      {busy && <ProgressBar value={STAGE_PCT[stage]} label={status} />}
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      {error && (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
