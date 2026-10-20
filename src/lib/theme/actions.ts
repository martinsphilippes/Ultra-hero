"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isTheme, THEME_COOKIE, type Theme } from "./constants";

// Persiste o tema no cookie (lido pelo layout raiz) e, se logado, no perfil.
export async function setThemeAction(theme: Theme): Promise<{ ok: boolean }> {
  if (!isTheme(theme)) return { ok: false };

  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

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

  return { ok: true };
}
