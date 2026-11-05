"use client";

import { useLayoutEffect } from "react";
import { THEME_COOKIE, resolveTheme } from "@/lib/theme/constants";
import { TEMPLATE_COOKIE, pickTemplate } from "@/lib/theme/template";

// /sobre tem aparência fixa (pedido do responsável): Ultra Perspectivas Petróleo no claro, sem botão de tema.
// Só troca os atributos do <html> enquanto a página está aberta; a escolha da pessoa (cookie/localStorage) não
// muda, e ao sair para o app ela volta a valer.
export const ABOUT_TEMPLATE = "perspectivas-petroleo";
export const ABOUT_THEME = "light";

/** Script inline: aplica antes da pintura no primeiro carregamento (sem piscar o tema da pessoa). */
export const FIXED_APPEARANCE_SCRIPT = `document.documentElement.setAttribute("data-template","${ABOUT_TEMPLATE}");document.documentElement.setAttribute("data-theme","${ABOUT_THEME}");`;

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function readStored(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

export function FixedAppearance() {
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-template", ABOUT_TEMPLATE);
    html.setAttribute("data-theme", ABOUT_THEME);
    return () => {
      // devolve a aparência escolhida pela pessoa (padrão: Original no escuro)
      html.setAttribute("data-template", pickTemplate(readCookie(TEMPLATE_COOKIE), readStored(TEMPLATE_COOKIE)));
      html.setAttribute("data-theme", resolveTheme(readCookie(THEME_COOKIE) ?? readStored(THEME_COOKIE)));
    };
  }, []);
  return null;
}
