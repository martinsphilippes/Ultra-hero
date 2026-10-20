"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "./config";

// Define o idioma da interface via cookie e, se houver sessão, salva no perfil.
export async function setLocaleAction(locale: Locale): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false };

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ locale }).eq("id", user.id);
    }
  } catch {
    // Preferência no perfil é opcional; o cookie já garante a experiência.
  }

  return { ok: true };
}
