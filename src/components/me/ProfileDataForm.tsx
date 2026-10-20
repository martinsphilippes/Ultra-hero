"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { updateProfile } from "@/app/(app)/profile/actions";
import { Button, FormField, Input, SegmentedControl, Select, useToast } from "@/components/ui";
import { locales, type Locale } from "@/i18n/config";
import { THEME_COOKIE, type Theme } from "@/lib/theme/constants";
import { cn } from "@/lib/utils";

type Props = { displayName: string; avatarUrl: string | null; locale: Locale; theme: Theme };

const AVATARS = Array.from({ length: 8 }, (_, i) => `/placeholders/avatar-${i + 1}.svg`);

// Formulário de dados do perfil: nome, avatar (ilustrações locais), idioma e tema.
export function ProfileDataForm({ displayName, avatarUrl, locale, theme }: Props) {
  const t = useTranslations("me.profile.data");
  const tl = useTranslations("common.languages");
  const tt = useTranslations("common.theme");
  const { toast } = useToast();
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [avatar, setAvatar] = useState<string | null>(avatarUrl && AVATARS.includes(avatarUrl) ? avatarUrl : null);
  const [lang, setLang] = useState<Locale>(locale);
  const [mode, setMode] = useState<Theme>(theme);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = name.trim() !== displayName || avatar !== avatarUrl || lang !== locale || mode !== theme;

  function applyTheme(value: Theme) {
    const root = document.documentElement;
    if (value === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", value);
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
      const result = await updateProfile({ displayName: name.trim(), avatarUrl: avatar, locale: lang, theme: mode });
      if (!result.ok) {
        setError(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.generic"));
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

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-fg">{t("avatar")}</legend>
        <p className="type-caption text-fg-muted">{t("avatarHint")}</p>
        <div role="radiogroup" aria-label={t("avatar")} className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {AVATARS.map((src, index) => {
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
                  onChange={() => setAvatar(src)}
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
          <SegmentedControl<Theme>
            aria-label={t("theme")}
            value={mode}
            onValueChange={setMode}
            options={[
              { value: "dark", label: tt("dark"), icon: <Moon /> },
              { value: "light", label: tt("light"), icon: <Sun /> },
              { value: "system", label: tt("system"), icon: <Monitor /> },
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
