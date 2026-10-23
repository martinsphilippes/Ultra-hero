"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { saveThemePreferenceAction } from "@/lib/theme/actions";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, type ResolvedTheme } from "@/lib/theme/constants";

const icons = { dark: <Moon />, light: <Sun /> };

type ThemeToggleProps = { initialTheme: ResolvedTheme; className?: string };

// Alterna claro ↔ escuro (o app abre no claro). Aplica na hora (sem flash) e persiste via action.
export function ThemeToggle({ initialTheme, className }: ThemeToggleProps) {
  const t = useTranslations("common.theme");
  const [theme, setTheme] = useState<ResolvedTheme>(initialTheme);
  const [, startTransition] = useTransition();

  // O script inicial pode ter aplicado a escolha guardada no aparelho antes de o cookie chegar ao
  // servidor (recarregar logo após trocar): o botão segue o tema que está de fato na tela.
  useEffect(() => {
    const applied = document.documentElement.getAttribute("data-theme");
    if (applied === "dark" || applied === "light") setTheme(applied);
  }, []);

  const next: ResolvedTheme = theme === "light" ? "dark" : "light";

  const apply = (value: ResolvedTheme) => {
    document.documentElement.setAttribute("data-theme", value);
    // Cookie gravado aqui, na hora: o script inicial dá prioridade ao cookie, e a action pode não chegar
    // ao servidor (recarregar logo depois a interrompe). Sem isto, o cookie antigo voltava o tema anterior.
    document.cookie = `${THEME_COOKIE}=${value}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax${window.location.protocol === "https:" ? "; secure" : ""}`;
    try {
      localStorage.setItem(THEME_COOKIE, value);
    } catch {
      // armazenamento indisponível (modo privado); o cookie cobre.
    }
    setTheme(value);
    startTransition(() => {
      void saveThemePreferenceAction(value);
    });
  };

  return (
    <IconButton
      className={className}
      icon={icons[theme]}
      label={`${t("current", { theme: t(theme) })}. ${t("switchTo", { theme: t(next) })}`}
      onClick={() => apply(next)}
    />
  );
}
