// Textos da própria casca (a web traz os dela). Mesmos três idiomas da web.
export type Strings = { offlineTitle: string; offlineBody: string; retry: string };

const STRINGS: Record<"pt-BR" | "en" | "es", Strings> = {
  "pt-BR": {
    offlineTitle: "Sem conexão",
    offlineBody: "Não foi possível abrir o GC Hero. Confira a internet e tente de novo.",
    retry: "Tentar de novo",
  },
  en: {
    offlineTitle: "No connection",
    offlineBody: "We couldn't open GC Hero. Check your internet connection and try again.",
    retry: "Try again",
  },
  es: {
    offlineTitle: "Sin conexión",
    offlineBody: "No pudimos abrir GC Hero. Revisa tu conexión a internet e inténtalo de nuevo.",
    retry: "Reintentar",
  },
};

export function stringsFor(locale: string): Strings {
  const lang = locale.toLowerCase();
  if (lang.startsWith("es")) return STRINGS.es;
  if (lang.startsWith("en")) return STRINGS.en;
  return STRINGS["pt-BR"];
}
