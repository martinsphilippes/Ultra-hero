"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { setThemeAction } from "@/lib/theme/actions";
import { THEME_COOKIE, type Theme } from "@/lib/theme/constants";

const order: Theme[] = ["dark", "light", "system"];
const icons = { dark: <Moon />, light: <Sun />, system: <Monitor /> };

type ThemeToggleProps = { initialTheme: Theme; className?: string };

// Alterna escuro → claro → sistema. Aplica na hora (sem flash) e persiste via action.
export function ThemeToggle({ initialTheme, className }: ThemeToggleProps) {
  const t = useTranslations("common.theme");
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [, startTransition] = useTransition();

  const next = order[(order.indexOf(theme) + 1) % order.length];

  const apply = (value: Theme) => {
    const root = document.documentElement;
    if (value === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", value);
    try {
      localStorage.setItem(THEME_COOKIE, value);
    } catch {
      // armazenamento indisponível (modo privado); o cookie cobre.
    }
    setTheme(value);
    startTransition(() => {
      void setThemeAction(value);
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
