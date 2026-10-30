"use client";

import { ImageUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { uploadBrandImageAction } from "@/app/admin/marcas/actions";
import { Button, Input, Label } from "@/components/ui";
import { prepareFittedImage } from "@/lib/avatar/resize";

type Props = {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** "logo" mostra a prévia baixa e larga; "product", quadrada. */
  kind: "logo" | "product";
};

// Logo/foto do produto: envio (reduzido no aparelho para até 1200 px, WebP/JPEG, sem EXIF; o servidor
// confere os bytes e grava no bucket brand-media) ou um endereço https / arquivo do site (/brands/...).
export function ImageField({ label, hint, value, onChange, disabled, kind }: Props) {
  const t = useTranslations("adminOps.brands.image");
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function upload(file: File) {
    setError(null);
    startTransition(async () => {
      try {
        const prepared = await prepareFittedImage(file, { maxEdge: 1200, maxBytes: 1_400_000 });
        const form = new FormData();
        form.set("file", prepared.blob, prepared.mime === "image/webp" ? "image.webp" : "image.jpg");
        const result = await uploadBrandImageAction(form);
        if (!result.ok) setError(result.error);
        else if (result.url) onChange(result.url);
      } catch {
        setError(t("failed"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-url`}>{label}</Label>
      <div className="flex items-start gap-3">
        <div
          className={
            kind === "logo"
              ? "flex h-12 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border-strong bg-surface-elevated"
              : "flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border-strong bg-surface-elevated"
          }
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={t("preview")} className="max-h-full max-w-full object-contain" />
          ) : (
            <ImageUp aria-hidden="true" className="size-5 text-fg-subtle" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" leadingIcon={<ImageUp />} loading={pending} disabled={disabled} onClick={() => fileRef.current?.click()}>
              {pending ? t("uploading") : t("upload")}
            </Button>
            {value ? (
              <Button type="button" size="sm" variant="ghost" leadingIcon={<X />} disabled={disabled || pending} onClick={() => onChange("")}>
                {t("remove")}
              </Button>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/webp,image/jpeg,image/png"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload(file);
            }}
          />
          <Input id={`${id}-url`} value={value} placeholder={t("url")} disabled={disabled || pending} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-hint`} inputSize="sm" />
          <p id={`${id}-hint`} className="type-caption text-fg-muted">
            {hint}
          </p>
          {error ? (
            <p role="alert" className="type-caption text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
