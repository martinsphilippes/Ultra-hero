"use client";

import { Moon, RotateCcw, Sun, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { updateProfile } from "@/app/(app)/profile/actions";
import { Button, FormField, Input, SegmentedControl, Select, useToast } from "@/components/ui";
import { locales, type Locale } from "@/i18n/config";
import type { AvatarPhotoState } from "@/lib/avatar/availability";
import { ILLUSTRATIONS } from "@/lib/avatar/constants";
import { discardsSavedPhoto, isStoredAvatarUrl, supabaseBaseUrl } from "@/lib/avatar/paths";
import { THEME_COOKIE, type ResolvedTheme } from "@/lib/theme/constants";
import { cn } from "@/lib/utils";
import { AvatarPhotoPicker } from "./AvatarPhotoPicker";

type Props = {
  displayName: string;
  avatarUrl: string | null;
  locale: Locale;
  theme: ResolvedTheme;
  photoState: AvatarPhotoState;
  /** Texto de apoio da foto (heróis: a mesma foto vale na página pública). */
  photoHint?: string;
};

const knownAvatar = (url: string | null) => (url && (ILLUSTRATIONS.includes(url) || isStoredAvatarUrl(url, supabaseBaseUrl())) ? url : null);

// Formulário de dados do perfil: nome, avatar (foto enviada pelo celular ou ilustração local), idioma
// e tema. A foto é gravada pelas actions próprias (envio/remoção); aqui só sincroniza o estado para
// "Salvar" não regravar um valor velho. Escolher uma ilustração e salvar substitui a foto. O avatar só
// vai para a action se a pessoa mexeu nele aqui (o perfil do herói, na mesma página, também mexe nele).
export function ProfileDataForm({ displayName, avatarUrl, locale, theme, photoState, photoHint }: Props) {
  const t = useTranslations("me.profile.data");
  const tl = useTranslations("common.languages");
  const tt = useTranslations("common.theme");
  const { toast } = useToast();
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [avatar, setAvatar] = useState<string | null>(knownAvatar(avatarUrl));
  const [avatarTouched, setAvatarTouched] = useState(false);
  const hasPhoto = isStoredAvatarUrl(avatar, supabaseBaseUrl());
  // Foto gravada no servidor (não o rascunho): só muda pelo envio/remoção do picker ou ao salvar.
  // Com ela, tocar numa ilustração não pode esconder que salvar apaga a foto.
  const [savedPhoto, setSavedPhoto] = useState<string | null>(isStoredAvatarUrl(avatarUrl, supabaseBaseUrl()) ? avatarUrl : null);
  const discarding = discardsSavedPhoto(savedPhoto, avatar);
  const illustrationsRef = useRef<HTMLParagraphElement>(null);

  // Avatar novo do servidor (ex.: o herói trocou a ilustração pública e a foto saiu do ar): ajusta o
  // estado durante a renderização, sem efeito. A foto salva acompanha o servidor; o avatar escolhido
  // só quando a pessoa não mexeu nele.
  const [serverAvatar, setServerAvatar] = useState(avatarUrl);
  if (avatarUrl !== serverAvatar) {
    setServerAvatar(avatarUrl);
    setSavedPhoto(isStoredAvatarUrl(avatarUrl, supabaseBaseUrl()) ? avatarUrl : null);
    if (!avatarTouched) setAvatar(knownAvatar(avatarUrl));
  }
  const [lang, setLang] = useState<Locale>(locale);
  const [mode, setMode] = useState<ResolvedTheme>(theme);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = name.trim() !== displayName || (avatarTouched && avatar !== avatarUrl) || lang !== locale || mode !== theme;

  function applyTheme(value: ResolvedTheme) {
    const root = document.documentElement;
    root.setAttribute("data-theme", value);
    try {
      localStorage.setItem(THEME_COOKIE, value);
    } catch {
      // armazenamento indisponível; o cookie cobre
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length === 0) {
      setError(t("errors.invalid_input"));
      return;
    }
    setError(null);
    startTransition(async () => {
      // sem mexer no avatar ele não vai: a action mantém o do banco
      const result = await updateProfile({ displayName: name.trim(), ...(avatarTouched ? { avatarUrl: avatar } : {}), locale: lang, theme: mode });
      if (!result.ok) {
        setError(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.generic"));
        return;
      }
      applyTheme(mode);
      if (avatarTouched) setSavedPhoto(isStoredAvatarUrl(avatar, supabaseBaseUrl()) ? avatar : null);
      setAvatarTouched(false);
      toast({ title: t("saved"), variant: "success" });
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <FormField label={t("displayName")} hint={t("displayNameHint")} error={error ?? undefined} required>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="nickname" disabled={pending} />
      </FormField>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-fg">{t("avatar")}</legend>
        <p className="type-caption text-fg-muted">{t("avatarHint")}</p>
        <AvatarPhotoPicker
          value={avatar}
          name={name.trim() || displayName}
          state={photoState}
          onChange={(next) => {
            // envio/remoção já aplicados no servidor: o avatar volta a estar em dia
            setAvatar(next);
            setSavedPhoto(isStoredAvatarUrl(next, supabaseBaseUrl()) ? next : null);
            setAvatarTouched(false);
          }}
          disabled={pending}
          hint={photoHint}
        />
        <p ref={illustrationsRef} tabIndex={-1} className="mt-2 text-sm font-semibold text-fg outline-none" id="avatar-illustrations-label">
          {t("illustrations")}
        </p>
        {hasPhoto && <p className="type-caption text-fg-muted">{t("illustrationsWhenPhoto")}</p>}
        <div role="radiogroup" aria-labelledby="avatar-illustrations-label" className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {ILLUSTRATIONS.map((src, index) => {
            const selected = avatar === src;
            const id = `avatar-${index + 1}`;
            return (
              <div key={src} className="relative">
                <input
                  id={id}
                  type="radio"
                  name="avatar"
                  value={src}
                  checked={selected}
                  onChange={() => {
                    setAvatar(src);
                    setAvatarTouched(true);
                  }}
                  disabled={pending}
                  className="peer sr-only"
                />
                <label
                  htmlFor={id}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-center rounded-xl border-2 p-1 transition-colors",
                    "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                    selected ? "border-accent bg-accent-soft" : "border-border hover:border-fg-subtle",
                  )}
                >
                  <Image src={src} alt={t("avatarOption", { n: index + 1 })} width={48} height={48} unoptimized className="size-12 rounded-full" />
                </label>
              </div>
            );
          })}
        </div>
        {/* região viva sempre montada: o aviso é anunciado ao aparecer */}
        <div role="status" data-testid="avatar-discard-warning">
          {discarding && savedPhoto && (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-sm text-fg">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                {t("photoWillBeDeleted")}
              </p>
              <Button
                type="button"
                variant="secondary"
                leadingIcon={<RotateCcw />}
                disabled={pending}
                onClick={() => {
                  setAvatar(savedPhoto);
                  setAvatarTouched(false);
                  // o botão some com o aviso: o foco fica no título das ilustrações
                  requestAnimationFrame(() => illustrationsRef.current?.focus());
                }}
              >
                {t("keepPhoto")}
              </Button>
            </div>
          )}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={t("language")}>
          <Select value={lang} onChange={(e) => setLang(e.target.value as Locale)} disabled={pending}>
            {locales.map((code) => (
              <option key={code} value={code}>
                {tl(code)}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-fg" id="theme-label">
            {t("theme")}
          </span>
          <SegmentedControl<ResolvedTheme>
            aria-label={t("theme")}
            value={mode}
            onValueChange={setMode}
            options={[
              { value: "dark", label: tt("dark"), icon: <Moon /> },
              { value: "light", label: tt("light"), icon: <Sun /> },
            ]}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={pending} disabled={!dirty}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
