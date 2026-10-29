"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { useId } from "react";
import { FormField, Input } from "@/components/ui";
import { supabaseBaseUrl } from "@/lib/avatar/paths";
import { storedPostPhotoPath } from "@/lib/post-photo/paths";
import { cn } from "@/lib/utils";
import { SAME_ORIGIN_PATH } from "./schema";

type Props = {
  pillar: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

/** Capas padrão do pilar (sem imagens externas). */
export function coverOptionsFor(pillar: string): string[] {
  return [1, 2, 3].map((n) => `/placeholders/cover-${pillar}-${n}.svg`);
}

// Escolha de capa: três placeholders do pilar (rádios com miniatura) ou um caminho da própria origem.
export function CoverPicker({ pillar, value, onChange, error }: Props) {
  const t = useTranslations("editors.cover");
  const baseId = useId();
  const options = coverOptionsFor(pillar);
  const isCustom = value !== "" && !options.includes(value);
  // foto do post com foto (0043) também aparece na prévia
  const previewOk = value !== "" && (SAME_ORIGIN_PATH.test(value) || storedPostPhotoPath(value, supabaseBaseUrl()) !== null);

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-labelledby={`${baseId}-label`} className="flex flex-col gap-2">
        <span id={`${baseId}-label`} className="text-sm font-semibold text-fg">
          {t("placeholders")}
        </span>
        <div className="grid grid-cols-3 gap-2 sm:max-w-md">
          {options.map((src, index) => {
            const id = `${baseId}-opt-${index}`;
            const checked = value === src;
            return (
              <label key={src} htmlFor={id} className="group relative block cursor-pointer">
                <input id={id} type="radio" name={`${baseId}-cover`} value={src} checked={checked} onChange={() => onChange(src)} className="peer sr-only" aria-label={t("option", { n: index + 1 })} />
                <span
                  className={cn(
                    "block overflow-hidden rounded-xl border-2 transition-[border-color,box-shadow]",
                    "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                    checked ? "border-accent shadow-md" : "border-border hover:border-fg-subtle",
                  )}
                >
                  <Image src={src} alt="" width={320} height={180} unoptimized className="aspect-video w-full object-cover" />
                </span>
                <span className={cn("mt-1 block text-center text-xs font-medium", checked ? "text-accent-text" : "text-fg-muted")}>{t("option", { n: index + 1 })}</span>
              </label>
            );
          })}
        </div>
      </div>

      <FormField label={t("custom")} hint={t("customHint")} error={error}>
        <Input value={isCustom ? value : ""} placeholder="/placeholders/cover-routine-1.svg" maxLength={300} onChange={(e) => onChange(e.target.value.trim())} />
      </FormField>

      {isCustom && previewOk && (
        <figure className="flex flex-col gap-1">
          <Image src={value} alt="" width={320} height={180} unoptimized className="aspect-video w-full max-w-xs rounded-xl border border-border object-cover" />
          <figcaption className="type-caption text-fg-muted">{t("preview")}</figcaption>
        </figure>
      )}
      {value === "" && <p className="type-caption text-fg-subtle">{t("none")}</p>}
    </div>
  );
}
