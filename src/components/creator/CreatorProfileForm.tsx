"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { updateCreatorProfile } from "@/app/creator/profile/actions";
import { useValidationMessage } from "@/components/editors/content/fields";
import { AvatarPhotoPicker } from "@/components/me/AvatarPhotoPicker";
import { Button, FormField, Input, Textarea, useToast } from "@/components/ui";
import type { AvatarPhotoState } from "@/lib/avatar/availability";
import { ILLUSTRATIONS } from "@/lib/avatar/constants";
import { isStoredAvatarUrl, supabaseBaseUrl } from "@/lib/avatar/paths";
import { cn } from "@/lib/utils";
import { parseCreatorProfile, type CreatorProfileValues } from "./profile-schema";

type Props = { initial: CreatorProfileValues; pillars: string[]; readOnly?: boolean; name: string; photoState: AvatarPhotoState };

const AVATARS = ILLUSTRATIONS;
const ALL_PILLARS = ["routine", "training", "nutrition", "gastronomy"];

type ImageRadiosProps = {
  baseId: string;
  name: string;
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  round?: boolean;
  error?: string;
  optionLabel: (n: number) => string;
  noneLabel: string;
};

// Grupo de rádios com miniatura (avatar redondo ou capa 16:9). Fora do formulário para não remontar a cada render.
function ImageRadios({ baseId, name, label, options, value, onChange, round = false, error, optionLabel, noneLabel }: ImageRadiosProps) {
  return (
    <div role="radiogroup" aria-labelledby={`${baseId}-${name}`} className="flex flex-col gap-2">
      <span id={`${baseId}-${name}`} className="text-sm font-semibold text-fg">
        {label}
      </span>
      <div className={cn("grid gap-2", round ? "grid-cols-4 sm:grid-cols-8" : "grid-cols-3 sm:grid-cols-6")}>
        {options.map((src, index) => {
          const id = `${baseId}-${name}-${index}`;
          const checked = value === src;
          return (
            <label key={src} htmlFor={id} className="block cursor-pointer">
              <input id={id} type="radio" name={`${baseId}-${name}`} value={src} checked={checked} onChange={() => onChange(src)} className="peer sr-only" aria-label={optionLabel(index + 1)} />
              <span
                className={cn(
                  "block overflow-hidden border-2 transition-[border-color,box-shadow] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                  round ? "rounded-full" : "rounded-xl",
                  checked ? "border-accent shadow-md" : "border-border hover:border-fg-subtle",
                )}
              >
                <Image src={src} alt="" width={round ? 96 : 240} height={round ? 96 : 135} unoptimized className={cn("w-full object-cover", round ? "aspect-square" : "aspect-video")} />
              </span>
            </label>
          );
        })}
      </div>
      {!options.includes(value) && <p className="type-caption text-fg-subtle">{noneLabel}</p>}
      {error && (
        <p role="alert" className="type-caption font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// Formulário do perfil da personalidade: só as colunas liberadas (headline, bio, avatar, capa, redes).
export function CreatorProfileForm({ initial, pillars, readOnly = false, name, photoState }: Props) {
  const t = useTranslations("creator.profile");
  const te = useTranslations("creator.errors");
  const tc = useTranslations("common");
  const tv = useValidationMessage();
  const { toast } = useToast();
  const router = useRouter();
  const baseId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<CreatorProfileValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const coverPillars = pillars.length > 0 ? pillars : ALL_PILLARS;
  const covers = coverPillars.flatMap((p) => [1, 2, 3].map((n) => `/placeholders/cover-${p}-${n}.svg`));
  const errorCount = Object.keys(errors).length;
  const hasPhoto = isStoredAvatarUrl(values.avatar_url, supabaseBaseUrl());

  useEffect(() => {
    if (errorCount === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errorCount, errors]);

  function patch(p: Partial<CreatorProfileValues>) {
    setValues((v) => ({ ...v, ...p }));
  }
  function patchSocial(p: Partial<CreatorProfileValues["socials"]>) {
    setValues((v) => ({ ...v, socials: { ...v.socials, ...p } }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (readOnly || pending) return;
    const parsed = parseCreatorProfile(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await updateCreatorProfile(parsed.data);
      if (result.ok) {
        setServerError(null);
        toast({ title: tc("states.saved"), description: t("savedDescription"), variant: "success" });
        router.refresh();
      } else {
        const key = result.error.split(":")[0].trim();
        const message = key === "protected_column" ? te("protected_column", { column: result.error.split(":")[1]?.trim() ?? "?" }) : te.has(key) ? te(key) : te("generic");
        setServerError(message);
        toast({ title: tc("states.error"), description: message, variant: "error" });
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-busy={pending || undefined}>
      {(errorCount > 0 || serverError) && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg">
          {serverError ?? t("fixFields", { count: errorCount })}
        </div>
      )}
      <fieldset disabled={readOnly || pending} className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <FormField label={t("headline")} hint={t("headlineHint")} error={tv(errors.headline)}>
            <Input value={values.headline} maxLength={120} onChange={(e) => patch({ headline: e.target.value })} />
          </FormField>
          <FormField label={t("bio")} hint={t("bioHint")} error={tv(errors.bio)}>
            <Textarea value={values.bio} rows={5} maxLength={1200} onChange={(e) => patch({ bio: e.target.value })} />
          </FormField>
        </div>

        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          {/* Foto enviada pelo celular (0031): a mesma do perfil pessoal, gravada pelas actions próprias. */}
          <AvatarPhotoPicker value={values.avatar_url || null} name={name} state={photoState} onChange={(v) => patch({ avatar_url: v ?? "" })} disabled={readOnly || pending} hint={t("photoHint")} />
          <ImageRadios baseId={baseId} name="avatar" label={t("avatar")} options={AVATARS} value={values.avatar_url} onChange={(avatar_url) => patch({ avatar_url })} round error={tv(errors.avatar_url)} optionLabel={(n) => t("optionN", { n })} noneLabel={hasPhoto ? t("photoInUse") : t("noneSelected")} />
          <ImageRadios baseId={baseId} name="cover" label={t("cover")} options={covers} value={values.cover_url} onChange={(cover_url) => patch({ cover_url })} error={tv(errors.cover_url)} optionLabel={(n) => t("optionN", { n })} noneLabel={t("noneSelected")} />
        </div>

        <fieldset className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <legend className="px-1 text-base font-semibold text-fg">{t("socials")}</legend>
          <p className="-mt-2 type-body-sm text-fg-muted">{t("socialsHint")}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Instagram" error={tv(errors["socials.instagram"])}>
              <Input value={values.socials.instagram} maxLength={80} placeholder="@perfil" onChange={(e) => patchSocial({ instagram: e.target.value })} />
            </FormField>
            <FormField label="YouTube" error={tv(errors["socials.youtube"])}>
              <Input value={values.socials.youtube} maxLength={120} placeholder="@canal" onChange={(e) => patchSocial({ youtube: e.target.value })} />
            </FormField>
            <FormField label={t("site")} error={tv(errors["socials.site"])}>
              <Input value={values.socials.site} maxLength={200} placeholder="https://" onChange={(e) => patchSocial({ site: e.target.value })} />
            </FormField>
          </div>
        </fieldset>
      </fieldset>

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" loading={pending} size="lg">
            {tc("actions.save")}
          </Button>
        </div>
      )}
    </form>
  );
}
