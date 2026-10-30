import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultTimeZone, formats, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { parseNativeApp } from "@/lib/native-app/surface";
import { loadRequestMessages } from "./messages";
import { negotiateLocale } from "./negotiate";

// Resolve o idioma por request: cookie NEXT_LOCALE válido > Accept-Language > pt-BR.
async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const headerStore = await headers();
  return negotiateLocale(headerStore.get("accept-language"));
}

export default getRequestConfig(async ({ locale: explicit }) => {
  const locale = isLocale(explicit) ? explicit : await resolveLocale();
  return {
    locale,
    messages: await loadRequestMessages(locale, parseNativeApp((await headers()).get("user-agent")) !== null),
    timeZone: defaultTimeZone,
    formats,
    // Em produção não vaza chaves faltantes para o usuário; em dev loga no console.
    onError(error) {
      if (process.env.NODE_ENV !== "production") console.warn("[i18n]", error.message);
    },
    getMessageFallback({ namespace, key }) {
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});
