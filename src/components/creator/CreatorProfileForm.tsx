"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { updateCreatorProfile } from "@/app/creator/profile/actions";
import { useValidationMessage } from "@/components/editors/content/fields";
import { AvatarPhotoPicker } from "@/components/me/AvatarPhotoPicker";
import { Button, FormField, Input, Textarea, useToast } from "@/components/ui";
import type { AvatarPhotoState } from "@/lib/avatar/availability";
import { HERO_DEFAULT_AVATAR, ILLUSTRATIONS } from "@/lib/avatar/constants";
import { discardsSavedPhoto, isStoredAvatarUrl, supabaseBaseUrl } from "@/lib/avatar/paths";
import { cn } from "@/lib/utils";
import { useRevealHeroEditor } from "./HeroEditorDisclosure";
import { creatorProfilePayload, parseCreatorProfile, type CreatorProfileValues } from "./profile-schema";

type Props = {
  initial: CreatorProfileValues;
  pillars: string[];
  readOnly?: boolean;
  name: string;
  /** Mostra o envio de foto (perfil ativo): com ele, foto e ilustração daqui valem no app e na página pública. */
  showPhotoPicker?: boolean;
  photoState?: AvatarPhotoState;
};

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
export function CreatorProfileForm({ initial, pillars, readOnly = false, name, showPhotoPicker = true, photoState }: Props) {
  const t = useTranslations("creator.profile");
  const te = useTranslations("creator.errors");
  const tc = useTranslations("common");
  const tv = useValidationMessage();
  const { toast } = useToast();
  const router = useRouter();
  const baseId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const revealEditor = useRevealHeroEditor();
  const [values, setValues] = useState<CreatorProfileValues>(initial);
  // A pessoa mexeu no avatar neste formulário? Sem mexer, salvar não reenvia o avatar (a action mantém
  // o do banco): na mesma página a foto pode ter mudado em "Dados" e este estado estaria velho.
  const [avatarTouched, setAvatarTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const coverPillars = pillars.length > 0 ? pillars : ALL_PILLARS;
  const covers = coverPillars.flatMap((p) => [1, 2, 3].map((n) => `/placeholders/cover-${p}-${n}.svg`));
  const errorCount = Object.keys(errors).length;
  const hasPhoto = isStoredAvatarUrl(values.avatar_url, supabaseBaseUrl());
  // Foto gravada no servidor (não o rascunho): tocar numa ilustração não esconde que salvar a apaga.
  const [savedPhoto, setSavedPhoto] = useState<string | null>(isStoredAvatarUrl(initial.avatar_url, supabaseBaseUrl()) ? initial.avatar_url : null);
  const discarding = discardsSavedPhoto(savedPhoto, values.avatar_url);
  const keepAnchorRef = useRef<HTMLDivElement>(null);

  // Avatar novo do servidor (router.refresh depois de enviar/remover a foto em "Dados"): ajusta o estado
  // durante a renderização, sem efeito. A foto salva sempre acompanha o servidor; o avatar escolhido só
  // quando a pessoa não mexeu nele (o que ela escolheu continua escolhido, com o aviso se apaga a foto).
  const [serverAvatar, setServerAvatar] = useState(initial.avatar_url);
  if (initial.avatar_url !== serverAvatar) {
    setServerAvatar(initial.avatar_url);
    setSavedPhoto(isStoredAvatarUrl(initial.avatar_url, supabaseBaseUrl()) ? initial.avatar_url : null);
    if (!avatarTouched) setValues((v) => ({ ...v, avatar_url: initial.avatar_url }));
  }

  useEffect(() => {
    if (errorCount === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errorCount, errors]);

  // erro com o editor recolhido (fechado durante o envio): abre para a pessoa ver e corrigir
  useEffect(() => {
    if (errorCount > 0 || serverError) revealEditor();
  }, [errorCount, serverError, revealEditor]);

  function patch(p: Partial<CreatorProfileValues>) {
    setValues((v) => ({ ...v, ...p }));
  }
  function patchSocial(p: Partial<CreatorProfileValues["socials"]>) {
    setValues((v) => ({ ...v, socials: { ...v.socials, ...p } }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (readOnly || pending) return;
    // avatar só vai junto se a pessoa mexeu nele; sem ele a action mantém o valor do banco
    const avatar_url = values.avatar_url;
    const parsed = parseCreatorProfile(creatorProfilePayload(values, avatarTouched));
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await updateCreatorProfile(parsed.data);
      if (result.ok) {
        setServerError(null);
        if (avatarTouched) setSavedPhoto(isStoredAvatarUrl(avatar_url, supabaseBaseUrl()) ? avatar_url : null);
        setAvatarTouched(false);
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
          {/* Um avatar só para o herói: a foto (enviada pelas actions próprias, já grava o app e a página
              pública) e a ilustração (salva aqui, a action grava os dois lados). */}
          <fieldset className="flex min-w-0 flex-col gap-3" data-testid="hero-avatar">
            <legend className="text-base font-semibold text-fg">{t("avatarTitle")}</legend>
            <p className="-mt-1 type-body-sm text-fg-muted">{showPhotoPicker ? t("avatarShared") : t("avatarReadOnly")}</p>
            {showPhotoPicker && photoState && (
              <AvatarPhotoPicker
                value={values.avatar_url || null}
                name={name}
                state={photoState}
                onChange={(v) => {
                  // já aplicada no servidor: o avatar volta a estar em dia, sem mudança pendente
                  patch({ avatar_url: v ?? "" });
                  setSavedPhoto(isStoredAvatarUrl(v, supabaseBaseUrl()) ? v : null);
                  setAvatarTouched(false);
                }}
                disabled={readOnly || pending}
                hint={t("photoHint")}
                fallbackSrc={HERO_DEFAULT_AVATAR}
              />
            )}
            <div ref={keepAnchorRef} tabIndex={-1} className="outline-none">
              <ImageRadios
                baseId={baseId}
                name="avatar"
                label={t("illustrations")}
                options={AVATARS}
                value={values.avatar_url}
                onChange={(avatar_url) => {
                  patch({ avatar_url });
                  setAvatarTouched(true);
                }}
                round
                error={tv(errors.avatar_url)}
                optionLabel={(n) => t("optionN", { n })}
                noneLabel={hasPhoto ? t("photoInUse") : t("noneSelected")}
              />
            </div>
            {/* região viva sempre montada: o aviso é anunciado ao aparecer */}
            <div role="status" data-testid="hero-avatar-discard-warning">
              {discarding && savedPhoto && !readOnly && (
                <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-start gap-2 text-sm text-fg">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                    {t("photoWillBeDeleted")}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    leadingIcon={<RotateCcw />}
                    onClick={() => {
                      // volta à foto do servidor: nada pendente no avatar
                      patch({ avatar_url: savedPhoto });
                      setAvatarTouched(false);
                      // o botão some com o aviso: o foco fica no grupo das ilustrações
                      requestAnimationFrame(() => keepAnchorRef.current?.focus());
                    }}
                  >
                    {t("keepPhoto")}
                  </Button>
                </div>
              )}
            </div>
          </fieldset>
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
