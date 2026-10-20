"use client";

import { useTranslations } from "next-intl";
import { FormField, Input, Select } from "@/components/ui";
import type { ContentMedia } from "../types";
import { useValidationMessage } from "./fields";
import { parseMediaRef } from "./media";
import { ENABLED_MEDIA_PROVIDERS, type FieldErrors } from "./schema";

type Props = { value: ContentMedia; onChange: (value: ContentMedia) => void; errors: FieldErrors };

const OFFERED: ContentMedia["provider"][] = ["none", "embed_youtube", "embed_vimeo", "cloudflare_stream", "mux"];

// Mídia do vídeo: provedor (YouTube/Vimeo habilitados; Stream/Mux desabilitados por não estarem
// configurados), referência (ID ou URL) com prévia imediata, e legendas opcionais.
export function MediaEditor({ value, onChange, errors }: Props) {
  const t = useTranslations("editors.media");
  const tv = useValidationMessage();
  const isEmbed = value.provider === "embed_youtube" || value.provider === "embed_vimeo";
  const parsedId = isEmbed && value.ref ? parseMediaRef(value.provider, value.ref) : null;
  const refTouched = Boolean(value.ref && value.ref.trim());

  return (
    <div className="flex flex-col gap-4">
      <FormField label={t("provider")} hint={t("providerHint")} error={tv(errors["media.provider"])}>
        <Select value={value.provider} onChange={(e) => onChange({ ...value, provider: e.target.value as ContentMedia["provider"], ref: e.target.value === "none" ? null : value.ref })}>
          {OFFERED.map((p) => {
            const enabled = (ENABLED_MEDIA_PROVIDERS as readonly string[]).includes(p);
            return (
              <option key={p} value={p} disabled={!enabled}>
                {t(`providers.${p}`)}
                {!enabled ? ` — ${t("notConfigured")}` : ""}
              </option>
            );
          })}
        </Select>
      </FormField>

      {isEmbed && (
        <FormField label={t("ref")} hint={t(value.provider === "embed_youtube" ? "refHintYoutube" : "refHintVimeo")} error={tv(errors["media.ref"])} required>
          <Input value={value.ref ?? ""} maxLength={300} autoComplete="off" spellCheck={false} onChange={(e) => onChange({ ...value, ref: e.target.value })} />
        </FormField>
      )}
      {isEmbed && (
        <p aria-live="polite" className={parsedId ? "type-caption text-success" : refTouched ? "type-caption text-warning" : "type-caption text-fg-muted"}>
          {parsedId ? t("previewValid", { provider: t(`providers.${value.provider}`), id: parsedId }) : refTouched ? t("previewInvalid") : t("previewEmpty")}
        </p>
      )}

      <FormField label={t("captions")} hint={t("captionsHint")} error={tv(errors["media.captions_url"])}>
        <Input value={value.captions_url ?? ""} maxLength={500} placeholder="/captions/meu-video.pt-BR.vtt" onChange={(e) => onChange({ ...value, captions_url: e.target.value || null })} />
      </FormField>
    </div>
  );
}
