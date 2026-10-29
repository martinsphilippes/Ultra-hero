"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { updateProfile } from "@/app/(app)/profile/actions";
import { Button, FormField, Input, SegmentedControl, Select, useToast } from "@/components/ui";
import { locales, type Locale } from "@/i18n/config";
import type { AvatarPhotoState } from "@/lib/avatar/availability";
import { THEME_COOKIE, type ResolvedTheme } from "@/lib/theme/constants";
import { useRevealHeroEditor } from "@/components/creator/HeroEditorDisclosure";
import { AvatarPhotoPicker } from "./AvatarPhotoPicker";
import { profileDataInput } from "./profile-data";

type Props = {
  displayName: string;
  avatarUrl: string | null;
  locale: Locale;
  theme: ResolvedTheme;
  photoState: AvatarPhotoState;
  /** Texto de apoio da foto (heróis: a mesma foto vale na página pública). */
  photoHint?: string;
  /**
   * Herói com o perfil ativo: um avatar só, editado em "Editar perfil" (topo da página). Aqui fica só
   * um aviso com o atalho para lá, e salvar nunca envia o avatar.
   */
  avatarInHeroEditor?: boolean;
};

// Formulário de dados do perfil: nome, foto (só foto real, enviada pelo celular), idioma e tema. A
// foto é gravada pelas actions próprias (envio/remoção) e nunca vai no "Salvar". Sem foto, as
// iniciais do nome. Herói ativo: a foto fica em "Editar perfil".
export function ProfileDataForm({ displayName, avatarUrl, locale, theme, photoState, photoHint, avatarInHeroEditor = false }: Props) {
  const t = useTranslations("me.profile.data");
  const tl = useTranslations("common.languages");
  const tt = useTranslations("common.theme");
  const { toast } = useToast();
  const router = useRouter();
  const [name, setName] = useState(displayName);
  // Foto atual: acompanha o servidor (router.refresh depois do envio/remoção), sem efeito.
  const [avatar, setAvatar] = useState<string | null>(avatarUrl);
  const [serverAvatar, setServerAvatar] = useState(avatarUrl);
  if (avatarUrl !== serverAvatar) {
    setServerAvatar(avatarUrl);
    setAvatar(avatarUrl);
  }
  const [lang, setLang] = useState<Locale>(locale);
  const [mode, setMode] = useState<ResolvedTheme>(theme);
  const [error, setError] = useState<string | null>(null);
  // dentro de "Editar perfil" recolhido: erro escondido ninguém corrige
  const revealEditor = useRevealHeroEditor();
  const [pending, startTransition] = useTransition();

  const dirty = name.trim() !== displayName || lang !== locale || mode !== theme;

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
      revealEditor();
      return;
    }
    setError(null);
    startTransition(async () => {
      // o avatar nunca vai: a action mantém o do banco
      const result = await updateProfile(profileDataInput({ name, locale: lang, theme: mode }));
      if (!result.ok) {
        setError(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.generic"));
        revealEditor();
        return;
      }
      applyTheme(mode);
      toast({ title: t("saved"), variant: "success" });
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <FormField label={t("displayName")} hint={t("displayNameHint")} error={error ?? undefined} required>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="nickname" disabled={pending} />
      </FormField>

      {/* herói ativo: a foto fica só em "Editar perfil", no topo da página */}
      {avatarInHeroEditor ? null : (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-fg">{t("avatar")}</legend>
          <p className="type-caption text-fg-muted">{t("avatarHint")}</p>
          <AvatarPhotoPicker
            value={avatar}
            name={name.trim() || displayName}
            state={photoState}
            // envio/remoção já aplicados no servidor: só acompanha
            onChange={setAvatar}
            disabled={pending}
            hint={photoHint}
          />
        </fieldset>
      )}

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
