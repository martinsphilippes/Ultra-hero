"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { useId } from "react";
import { cn } from "@/lib/utils";

type Props = {
  options: readonly string[];
  value: string | null;
  onChange: (next: string) => void;
  /** Rótulo acessível do grupo. */
  label: string;
  /** Chave de tradução da opção ("imageOption" | "logoOption") em commerce.productForm.fields / seller.profile. */
  optionLabel: (index: number) => string;
  allowNone?: boolean;
  noneLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
  "aria-describedby"?: string;
};

// Seleção de imagem entre placeholders locais (radiogroup nativo, sem upload).
export function ImagePicker({ options, value, onChange, label, optionLabel, allowNone, noneLabel, disabled, invalid, ...aria }: Props) {
  const t = useTranslations("commerce.productForm.fields");
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2" aria-invalid={invalid || undefined} aria-describedby={aria["aria-describedby"]}>
      <legend className="sr-only">{label}</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {options.map((src, index) => {
          const checked = value === src;
          const id = `${name}-${index}`;
          return (
            <label
              key={src}
              htmlFor={id}
              className={cn(
                "relative flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-1 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
                checked ? "border-accent" : "border-border hover:border-fg-subtle",
                disabled && "cursor-not-allowed opacity-55",
              )}
            >
              <input id={id} type="radio" name={name} value={src} checked={checked} onChange={() => onChange(src)} disabled={disabled} className="sr-only" />
              <span className="relative block aspect-square w-full overflow-hidden rounded-lg bg-surface-elevated">
                <Image src={src} alt="" fill sizes="(min-width: 640px) 160px, 45vw" unoptimized={src.endsWith(".svg")} className="object-cover" />
              </span>
              <span className="type-caption text-center text-fg-muted">{optionLabel(index + 1)}</span>
            </label>
          );
        })}
        {allowNone ? (
          <label
            htmlFor={`${name}-none`}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-center rounded-xl border-2 p-2 text-sm text-fg-muted transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
              value === null ? "border-accent text-fg" : "border-border hover:border-fg-subtle",
            )}
          >
            <input id={`${name}-none`} type="radio" name={name} value="" checked={value === null} onChange={() => onChange("")} disabled={disabled} className="sr-only" />
            {noneLabel ?? t("imageHint")}
          </label>
        ) : null}
      </div>
    </fieldset>
  );
}
