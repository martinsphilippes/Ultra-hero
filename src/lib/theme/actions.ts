"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isTheme, THEME_COOKIE, THEME_COOKIE_MAX_AGE, type Theme } from "./constants";

async function saveProfileTheme(theme: Theme) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ theme }).eq("id", user.id);
    }
  } catch {
    // Preferência no perfil é opcional.
  }
}

// Persiste o tema no cookie (lido pelo layout raiz) e, se logado, no perfil. Usada pelos formulários
// (perfil e onboarding), que gravam o tema junto com o resto.
export async function setThemeAction(theme: Theme): Promise<{ ok: boolean }> {
  if (!isTheme(theme)) return { ok: false };

  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  await saveProfileTheme(theme);
  return { ok: true };
}

// Botão claro/escuro: o cookie já foi gravado no navegador, na hora do clique (ThemeToggle); aqui só o
// perfil. Sem Set-Cookie de propósito: a resposta de um clique anterior chegava depois do clique
// seguinte e trocava o cookie de volta para o tema antigo.
export async function saveThemePreferenceAction(theme: Theme): Promise<{ ok: boolean }> {
  if (!isTheme(theme)) return { ok: false };
  await saveProfileTheme(theme);
  return { ok: true };
}
