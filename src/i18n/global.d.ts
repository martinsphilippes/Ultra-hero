import type { locales } from "./config";

// Tipa o locale em useLocale()/getLocale() e hasLocale().
// As mensagens ficam sem tipagem estrita de propósito: cada engenheiro pode
// adicionar messages/<locale>/<namespace>.json sem tocar em arquivos compartilhados.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof locales)[number];
  }
}
