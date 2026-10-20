import "server-only";
import { cookies } from "next/headers";
import { getLocale as getIntlLocale, getTranslations } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";

// Idioma da request atual, já tipado.
export async function getLocale(): Promise<Locale> {
  const locale = await getIntlLocale();
  return isLocale(locale) ? locale : defaultLocale;
}

// Idioma vindo só do cookie (útil quando o next-intl ainda não está disponível).
export async function getLocaleFromCookie(): Promise<Locale | null> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : null;
}

// Atalho tipado para traduções em Server Components / actions.
export async function getT(namespace: string) {
  return getTranslations(namespace);
}

export { getTranslations };
