// Leitura tolerante do json de agency_cast_inputs (0096): linha mal formada some, número ruim vira null, nunca quebra a tela.
import type { CastAccount, CastContext, CastHeroInput } from "./mount";
import type { ValueModel } from "@/lib/value-model/model";

export type CastInputs = {
  canValues: boolean;
  context: CastContext & {
    kind: "deal" | "call";
    title: string;
    segments: Array<{ id: string; name: string }>;
    valueModel: ValueModel;
    maxHeroes: number | null;
    hasBudget: boolean;
    /** Só o Adm: valor total (modelo fixo), taxa da agência (pontos-base) e orçamento de cachês. */
    budgetCents: number | null;
    rateBp: number | null;
    feeBudgetCents: number | null;
    current: string[];
  };
  heroes: CastHeroInput[];
};

type Row = Record<string, unknown>;
const obj = (v: unknown): Row => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const int = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const strings = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string");

function account(r: Row): CastAccount | null {
  const network = str(r.network);
  const asOf = str(r.as_of);
  if (!network || !asOf) return null;
  const age = obj(r.age);
  const ageMap: Record<string, number> = {};
  for (const [k, v] of Object.entries(age)) {
    const n = int(v);
    if (n !== null) ageMap[k] = n;
  }
  return {
    network,
    followers: int(r.followers),
    avg_views: int(r.avg_views),
    avg_reach: int(r.avg_reach),
    engagement_bp: int(r.engagement_bp),
    as_of: asOf,
    source: str(r.source) ?? undefined,
    age: Object.keys(ageMap).length > 0 ? ageMap : null,
    top_states: Array.isArray(r.top_states) ? strings(r.top_states) : null,
  };
}

function hero(r: Row): CastHeroInput | null {
  const id = str(r.talent_id);
  const name = str(r.name);
  if (!id || !name) return null;
  const rating = obj(r.rating);
  const count = int(rating.count) ?? 0;
  const availability = r.availability === "limited" || r.availability === "unavailable" ? r.availability : "available";
  return {
    talent_id: id,
    name,
    city: str(r.city),
    state: str(r.state),
    availability,
    blocked: r.blocked === true,
    consent_ok: r.consent_ok === true,
    in_cast: r.in_cast === true,
    segments: strings(r.segments),
    accounts: arr(r.accounts).map((a) => account(obj(a))).filter((a): a is CastAccount => a !== null),
    rating: { count, quality_avg: int(rating.quality_avg), on_time_pct: int(rating.on_time_pct) },
    fee_source: r.fee_source === "deal" || r.fee_source === "past" ? r.fee_source : null,
    fee_cents: int(r.fee_cents),
    cost_bp: int(r.cost_bp),
  };
}

export function parseCastInputs(raw: unknown): CastInputs | null {
  const r = obj(raw);
  if (!r.context || !Array.isArray(r.heroes)) return null;
  const c = obj(r.context);
  return {
    canValues: r.can_values === true,
    context: {
      kind: c.kind === "call" ? "call" : "deal",
      title: str(c.title) ?? "",
      networks: strings(c.networks),
      target_age_bands: strings(c.target_age_bands),
      target_states: strings(c.target_states),
      segment_ids: arr(c.segments).map((s) => str(obj(s).id)).filter((x): x is string => x !== null),
      segments: arr(c.segments).map((s) => ({ id: str(obj(s).id) ?? "", name: str(obj(s).name) ?? "" })).filter((s) => s.id !== ""),
      period_start: str(c.period_start),
      period_end: str(c.period_end),
      valueModel: c.value_model === "por_heroi" ? "por_heroi" : "fixo",
      maxHeroes: int(c.max_heroes),
      hasBudget: c.has_budget === true,
      budgetCents: int(c.budget_cents),
      rateBp: int(c.rate_bp),
      feeBudgetCents: int(c.fee_budget_cents),
      current: strings(c.current),
    },
    heroes: r.heroes.map((h) => hero(obj(h))).filter((h): h is CastHeroInput => h !== null),
  };
}
