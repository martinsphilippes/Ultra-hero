import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  isMissingRpc,
  parseCollectibles,
  parseConversion,
  parseHeroes,
  parseProfessionals,
  parseRanking,
  parseShortcuts,
  type IndicatorPeriod,
  type IndicatorSection,
  type SectionData,
} from "./index";

// Leitura de uma seção dos Indicadores pelas RPCs do admin (0060). Sem a 0060 no banco: "missing"
// (a tela mostra "sem dados ainda"); outro erro: "error" (a tela mostra o erro).
export type SectionResult<S extends IndicatorSection> = { state: "ok"; data: SectionData[S] } | { state: "missing" } | { state: "error"; message?: string };

type RpcName =
  | "admin_indicators_heroes"
  | "admin_indicators_shortcuts"
  | "admin_indicators_conversion"
  | "admin_indicators_professionals"
  | "admin_indicators_collectibles"
  | "admin_indicators_ranking";

type Raw = { state: "ok"; data: unknown } | { state: "missing" } | { state: "error"; message?: string };

async function call(name: RpcName, days: number): Promise<Raw> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, { p_days: days });
  if (error) return isMissingRpc(error) ? { state: "missing" } : { state: "error", message: error.message };
  return { state: "ok", data };
}

export async function loadIndicatorSection<S extends IndicatorSection>(section: S, period: IndicatorPeriod): Promise<SectionResult<S>> {
  const days = Number(period);
  const one = async <T,>(name: RpcName, parse: (raw: unknown) => T): Promise<SectionResult<S>> => {
    const res = await call(name, days);
    return res.state === "ok" ? ({ state: "ok", data: parse(res.data) } as SectionResult<S>) : res;
  };
  switch (section) {
    case "herois":
      return one("admin_indicators_heroes", parseHeroes);
    case "atalhos":
      return one("admin_indicators_shortcuts", parseShortcuts);
    case "conversao":
      return one("admin_indicators_conversion", parseConversion);
    case "profissionais":
      return one("admin_indicators_professionals", parseProfessionals);
    case "colecionaveis":
      return one("admin_indicators_collectibles", parseCollectibles);
    default: {
      const [ranking, heroes] = await Promise.all([call("admin_indicators_ranking", days), call("admin_indicators_heroes", days)]);
      if (ranking.state !== "ok") return ranking;
      if (heroes.state !== "ok") return heroes;
      return { state: "ok", data: { ranking: parseRanking(ranking.data), heroes: parseHeroes(heroes.data) } } as SectionResult<S>;
    }
  }
}
