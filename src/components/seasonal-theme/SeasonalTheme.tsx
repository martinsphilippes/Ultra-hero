import { getLocale } from "next-intl/server";
import { getNativeApp } from "@/lib/native-app/server";
import { getSeasonForArea } from "@/lib/seasonal-theme/server";
import type { SeasonArea } from "@/lib/seasonal-theme/vocab";
import { SeasonalLayer } from "./SeasonalLayer";

// Tema sazonal da área (0100): resolvido no servidor pela data atual (sem cron, sem admin conectado), com cache de
// dados de 5 min. Sem tema → nada é renderizado (identidade padrão). Nunca derruba a página.
export async function SeasonalTheme({ area }: { area: SeasonArea }) {
  const [season, native, locale] = await Promise.all([getSeasonForArea(area).catch(() => null), getNativeApp(), getLocale()]);
  if (!season) return null;
  return <SeasonalLayer theme={season.theme} preview={season.preview} native={native !== null} locale={locale} />;
}
