import { splitProportional } from "@/lib/value-model/model";

// Montador de elenco (0096): dado um orçamento FIXO e os Heros do casting, calcula por Hero o alcance estimado, a
// aderência de público e o custo, e sugere combinações que cabem no orçamento. Lógica pura (sem tela e sem banco).
//
// Honestidade dos números: tudo parte do que a agência/Hero DECLAROU nas redes (seguidores, alcance médio, visualizações,
// engajamento) com a data do dado. Não há integração com as redes. Quando falta o alcance, usa as visualizações médias e,
// só em último caso, uma fração fixa dos seguidores (FOLLOWER_REACH_RATE), sempre sinalizado. "Vendas" não é dado real: é
// um indicador de potencial de resposta (alcance no público certo × engajamento). A soma de alcances não desconta Hero
// que se repete entre as audiências.

export type CastGoal = "reach" | "engagement" | "audience" | "sales" | "mix";
export const CAST_GOALS: CastGoal[] = ["reach", "engagement", "audience", "sales", "mix"];

/** Pesos simples (0 a 3) de cada resultado; o objetivo escolhido preenche os pesos, o usuário pode ajustar. */
export type CastWeights = { reach: number; engagement: number; fit: number; response: number };
export const GOAL_WEIGHTS: Record<CastGoal, CastWeights> = {
  reach: { reach: 3, engagement: 0, fit: 0, response: 0 },
  engagement: { reach: 0, engagement: 3, fit: 0, response: 0 },
  audience: { reach: 0, engagement: 0, fit: 3, response: 0 },
  sales: { reach: 0, engagement: 1, fit: 1, response: 3 },
  mix: { reach: 2, engagement: 2, fit: 2, response: 0 },
};

/** Fração dos seguidores usada como alcance quando o Hero não declarou alcance nem visualizações. */
export const FOLLOWER_REACH_RATE = 0.1;
/** Dado declarado há mais dias que isso é marcado como antigo. */
export const STALE_DAYS = 180;
export const MAX_CAST_SIZE = 8;

export type CastAccount = {
  network: string;
  followers: number | null;
  avg_views: number | null;
  avg_reach: number | null;
  engagement_bp: number | null;
  as_of: string;
  source?: string;
  age: Record<string, number> | null;
  top_states: string[] | null;
};

export type CastHeroInput = {
  talent_id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  availability: "available" | "limited" | "unavailable";
  blocked: boolean;
  consent_ok: boolean;
  in_cast: boolean;
  segments: string[];
  accounts: CastAccount[];
  rating: { count: number; quality_avg: number | null; on_time_pct: number | null } | null;
  fee_source: "deal" | "past" | null;
  /** Só o Adm recebe o cachê em centavos. */
  fee_cents: number | null;
  /** Gestor: cachê ÷ orçamento de cachês em pontos-base (sem moeda). */
  cost_bp: number | null;
};

export type CastContext = {
  networks: string[];
  target_age_bands: string[];
  target_states: string[];
  segment_ids: string[];
  period_start: string | null;
  period_end: string | null;
};

export type HeroFlag =
  | "no_data" // sem alcance, visualizações nem seguidores nas redes da campanha
  | "followers_estimate" // alcance estimado a partir dos seguidores
  | "views_estimate" // alcance estimado pelas visualizações médias
  | "stale" // dado declarado há mais de STALE_DAYS
  | "no_engagement" // sem engajamento declarado
  | "no_fee" // sem cachê conhecido
  | "no_audience" // sem dado de público para comparar
  | "no_rating" // sem nota nem entregas no prazo
  | "no_network" // sem conta nas redes da campanha
  | "blocked" // bloqueado nas datas
  | "unavailable" // indisponível no casting
  | "limited" // disponibilidade limitada
  | "no_consent"; // sem consentimento vigente

export type HeroMetrics = {
  id: string;
  name: string;
  /** Alcance estimado por publicação (soma das redes da campanha). */
  reach: number;
  /** Pessoas que engajam: alcance × taxa de engajamento. */
  engaged: number;
  /** Aderência de público de 0 a 1 (null = sem dado). */
  fit: number | null;
  /** Alcance no público certo: alcance × aderência (neutra 0,5 sem dado). */
  qualifiedReach: number;
  /** Potencial de resposta: alcance no público certo × taxa de engajamento. */
  response: number;
  engagementRate: number | null;
  /** Fator de confiança de 0,85 a 1 pela nota e entregas no prazo. */
  reliability: number;
  /** Custo na unidade do orçamento (centavos para o Adm, pontos-base para o gestor). */
  cost: number | null;
  /** Data mais antiga do dado usado (AAAA-MM-DD). */
  dataAsOf: string | null;
  dataAgeDays: number | null;
  flags: HeroFlag[];
  /** Entra nas sugestões automáticas? (o ajuste manual pode incluir qualquer um.) */
  eligible: boolean;
  /** Valor do Hero para o objetivo (0 a ~1), já com a confiança. */
  value: number;
  /** Custo por mil alcançados na unidade do orçamento. */
  costPerThousand: number | null;
};

const num = (x: number | null | undefined): number => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);

function daysBetween(from: string, to: Date): number {
  const [y, m, d] = from.split("-").map(Number);
  const a = Date.UTC(y, (m || 1) - 1, d || 1);
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

function accountReach(a: CastAccount): { reach: number; kind: "reach" | "views" | "followers" | "none" } {
  if (num(a.avg_reach) > 0) return { reach: num(a.avg_reach), kind: "reach" };
  if (num(a.avg_views) > 0) return { reach: num(a.avg_views), kind: "views" };
  if (num(a.followers) > 0) return { reach: Math.round(num(a.followers) * FOLLOWER_REACH_RATE), kind: "followers" };
  return { reach: 0, kind: "none" };
}

function audienceFit(accounts: Array<{ a: CastAccount; reach: number }>, hero: CastHeroInput, ctx: CastContext): number | null {
  const parts: number[] = [];
  if (ctx.target_age_bands.length > 0) {
    let num_ = 0;
    let den = 0;
    for (const { a, reach } of accounts) {
      if (!a.age || Object.keys(a.age).length === 0) continue;
      const share = ctx.target_age_bands.reduce((s, b) => s + (a.age?.[b] ?? 0), 0) / 10_000;
      const w = reach > 0 ? reach : 1;
      num_ += Math.min(1, share) * w;
      den += w;
    }
    if (den > 0) parts.push(num_ / den);
  }
  if (ctx.target_states.length > 0) {
    let num_ = 0;
    let den = 0;
    for (const { a, reach } of accounts) {
      if (!a.top_states || a.top_states.length === 0) continue;
      const top = new Set(a.top_states.map((s) => s.toUpperCase()));
      const hit = ctx.target_states.filter((s) => top.has(s.toUpperCase())).length;
      const possible = Math.min(ctx.target_states.length, top.size);
      const w = reach > 0 ? reach : 1;
      num_ += (possible > 0 ? hit / possible : 0) * w;
      den += w;
    }
    if (den > 0) parts.push(num_ / den);
  }
  if (ctx.segment_ids.length > 0 && hero.segments.length > 0) {
    parts.push(hero.segments.some((s) => ctx.segment_ids.includes(s)) ? 1 : 0);
  }
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function reliabilityOf(r: CastHeroInput["rating"]): { value: number; known: boolean } {
  if (!r || !r.count || r.count < 1) return { value: 0.93, known: false };
  const q = r.quality_avg ?? 3;
  const ot = r.on_time_pct ?? 80;
  const score = ((Math.min(5, Math.max(1, q)) - 1) / 4) * 0.6 + (Math.min(100, Math.max(0, ot)) / 100) * 0.4;
  return { value: 0.85 + 0.15 * score, known: true };
}

/** Métricas de UM Hero (sem o valor para o objetivo, que depende do conjunto — ver scoreHeroes). */
export function heroMetrics(hero: CastHeroInput, ctx: CastContext, today: Date = new Date()): Omit<HeroMetrics, "value" | "costPerThousand"> {
  const flags: HeroFlag[] = [];
  const wanted = ctx.networks.length > 0 ? hero.accounts.filter((a) => ctx.networks.includes(a.network)) : hero.accounts;
  if (hero.accounts.length > 0 && wanted.length === 0) flags.push("no_network");
  const used = wanted.map((a) => ({ a, ...accountReach(a) }));
  const reach = used.reduce((s, x) => s + x.reach, 0);
  if (reach === 0) flags.push("no_data");
  if (used.some((x) => x.kind === "followers" && x.reach > 0)) flags.push("followers_estimate");
  if (used.some((x) => x.kind === "views" && x.reach > 0)) flags.push("views_estimate");

  // engajamento: média das contas ponderada pelo alcance
  let engNum = 0;
  let engDen = 0;
  for (const x of used) {
    if (x.a.engagement_bp === null || x.a.engagement_bp === undefined) continue;
    const w = x.reach > 0 ? x.reach : 1;
    engNum += (x.a.engagement_bp / 10_000) * w;
    engDen += w;
  }
  const engagementRate = engDen > 0 ? engNum / engDen : null;
  if (engagementRate === null && reach > 0) flags.push("no_engagement");

  const fit = reach > 0 ? audienceFit(used, hero, ctx) : null;
  const hasTarget = ctx.target_age_bands.length > 0 || ctx.target_states.length > 0 || ctx.segment_ids.length > 0;
  if (hasTarget && fit === null && reach > 0) flags.push("no_audience");

  const qualifiedReach = reach * (fit ?? 0.5);
  const engaged = reach * (engagementRate ?? 0);
  const response = qualifiedReach * (engagementRate ?? 0);

  const dates = used.filter((x) => x.reach > 0).map((x) => x.a.as_of).filter(Boolean).sort();
  const dataAsOf = dates.length > 0 ? dates[0] : null;
  const dataAgeDays = dataAsOf ? daysBetween(dataAsOf, today) : null;
  if (dataAgeDays !== null && dataAgeDays > STALE_DAYS) flags.push("stale");

  const rel = reliabilityOf(hero.rating);
  if (!rel.known) flags.push("no_rating");

  const cost = hero.fee_cents ?? hero.cost_bp ?? null;
  if (cost === null) flags.push("no_fee");

  if (hero.blocked) flags.push("blocked");
  if (hero.availability === "unavailable") flags.push("unavailable");
  else if (hero.availability === "limited") flags.push("limited");
  if (!hero.consent_ok) flags.push("no_consent");

  const eligible = reach > 0 && cost !== null && !hero.blocked && hero.availability !== "unavailable" && hero.consent_ok && !flags.includes("no_network");
  return { id: hero.talent_id, name: hero.name, reach, engaged, fit, qualifiedReach, response, engagementRate, reliability: rel.value, cost, dataAsOf, dataAgeDays, flags, eligible };
}

/** Valor de cada Hero para o objetivo: cada resultado normalizado pelo maior do conjunto, ponderado e com a confiança. */
export function scoreHeroes(heroes: CastHeroInput[], ctx: CastContext, weights: CastWeights, today: Date = new Date()): HeroMetrics[] {
  const base = heroes.map((h) => heroMetrics(h, ctx, today));
  const pool = base.filter((b) => b.eligible);
  const max = {
    reach: Math.max(0, ...pool.map((b) => b.reach)),
    engagement: Math.max(0, ...pool.map((b) => b.engaged)),
    fit: Math.max(0, ...pool.map((b) => b.qualifiedReach)),
    response: Math.max(0, ...pool.map((b) => b.response)),
  };
  const sumW = weights.reach + weights.engagement + weights.fit + weights.response;
  const w = sumW > 0 ? weights : { reach: 1, engagement: 1, fit: 1, response: 0 };
  const total = w.reach + w.engagement + w.fit + w.response;
  const norm = (x: number, m: number) => (m > 0 ? x / m : 0);
  return base.map((b) => {
    const raw =
      (w.reach * norm(b.reach, max.reach) + w.engagement * norm(b.engaged, max.engagement) + w.fit * norm(b.qualifiedReach, max.fit) + w.response * norm(b.response, max.response)) / total;
    return {
      ...b,
      value: b.reach > 0 ? raw * b.reliability : 0,
      costPerThousand: b.cost !== null && b.reach > 0 ? (b.cost / b.reach) * 1000 : null,
    };
  });
}

export type CastTotals = {
  ids: string[];
  count: number;
  cost: number;
  leftover: number;
  usedPct: number;
  reach: number;
  engaged: number;
  qualifiedReach: number;
  response: number;
  /** Aderência média ponderada pelo alcance (null se ninguém tem dado). */
  fit: number | null;
  costPerThousand: number | null;
  value: number;
  /** Heros do elenco sem custo, sem dados etc. — avisos do conjunto. */
  missingFee: string[];
  missingData: string[];
  stale: string[];
  overBudget: boolean;
};

export function evaluateCast(metrics: HeroMetrics[], ids: string[], budget: number): CastTotals {
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const chosen = ids.map((id) => byId.get(id)).filter((m): m is HeroMetrics => !!m);
  const cost = chosen.reduce((s, m) => s + (m.cost ?? 0), 0);
  const reach = chosen.reduce((s, m) => s + m.reach, 0);
  const fitDen = chosen.filter((m) => m.fit !== null).reduce((s, m) => s + m.reach, 0);
  const fitNum = chosen.filter((m) => m.fit !== null).reduce((s, m) => s + m.reach * (m.fit ?? 0), 0);
  return {
    ids: chosen.map((m) => m.id),
    count: chosen.length,
    cost,
    leftover: budget - cost,
    usedPct: budget > 0 ? Math.round((cost / budget) * 100) : 0,
    reach,
    engaged: chosen.reduce((s, m) => s + m.engaged, 0),
    qualifiedReach: chosen.reduce((s, m) => s + m.qualifiedReach, 0),
    response: chosen.reduce((s, m) => s + m.response, 0),
    fit: fitDen > 0 ? fitNum / fitDen : null,
    costPerThousand: reach > 0 && cost > 0 ? (cost / reach) * 1000 : null,
    value: chosen.reduce((s, m) => s + m.value, 0),
    missingFee: chosen.filter((m) => m.cost === null).map((m) => m.name),
    missingData: chosen.filter((m) => m.flags.includes("no_data") || m.flags.includes("no_network")).map((m) => m.name),
    stale: chosen.filter((m) => m.flags.includes("stale")).map((m) => m.name),
    overBudget: cost > budget,
  };
}

/**
 * Melhor conjunto de exatamente k Heros (k = 1..maxK) com custo ≤ orçamento, maximizando a soma dos valores: mochila
 * com contagem. Os custos viram baldes (arredondados PARA CIMA, então o resultado cabe de verdade no orçamento).
 */
export function bestByCount(items: Array<{ id: string; value: number; cost: number }>, budget: number, maxK: number, buckets = 1000): Map<number, string[]> {
  const result = new Map<number, string[]>();
  const cand = items.filter((i) => i.value > 0 && i.cost >= 0 && i.cost <= budget);
  const n = cand.length;
  const K = Math.min(maxK, n);
  if (n === 0 || K === 0 || budget < 0) return result;
  const step = Math.max(1, Math.ceil(budget / buckets));
  const B = Math.floor(budget / step);
  const w = cand.map((i) => Math.ceil(i.cost / step));
  const NEG = -1;
  // dp[k][c]: melhor valor com exatamente k itens e peso ≤ c
  const dp: Float64Array[] = Array.from({ length: K + 1 }, (_, k) => new Float64Array(B + 1).fill(k === 0 ? 0 : NEG));
  const take = Array.from({ length: n }, () => Array.from({ length: K + 1 }, () => new Uint8Array(B + 1)));
  for (let i = 0; i < n; i++) {
    for (let k = Math.min(K, i + 1); k >= 1; k--) {
      for (let c = B; c >= w[i]; c--) {
        const prev = dp[k - 1][c - w[i]];
        if (prev < 0) continue;
        const cand_ = prev + cand[i].value;
        if (cand_ > dp[k][c] + 1e-12) {
          dp[k][c] = cand_;
          take[i][k][c] = 1;
        }
      }
    }
  }
  for (let k = 1; k <= K; k++) {
    if (dp[k][B] < 0) continue;
    const ids: string[] = [];
    let c = B;
    let kk = k;
    for (let i = n - 1; i >= 0 && kk > 0; i--) {
      if (take[i][kk][c]) {
        ids.push(cand[i].id);
        c -= w[i];
        kk -= 1;
      }
    }
    result.set(k, ids.reverse());
  }
  return result;
}

export type CastStrategy = "solo" | "few" | "mix";
export type CastReason = { code: string; params?: Record<string, string | number> };
export type CastSuggestion = { strategy: CastStrategy; totals: CastTotals; reasons: CastReason[] };

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Sugere até 3 combinações que cabem no orçamento: "um nome forte" (1 Hero), "poucos médios" (3, senão 2) e "mix" (mais
 * nomes, 4 ou mais; senão a melhor de 2 ou mais que ainda não apareceu). Combinações repetidas são trocadas por outro
 * tamanho; se não houver, ficam menos de 3. `maxHeroes` limita o tamanho (por exemplo, o máximo da chamada).
 */
export function suggestCasts(metrics: HeroMetrics[], budget: number, opts: { maxHeroes?: number | null } = {}): CastSuggestion[] {
  const cap = Math.max(1, Math.min(opts.maxHeroes ?? MAX_CAST_SIZE, MAX_CAST_SIZE));
  const items = metrics.filter((m) => m.eligible && m.cost !== null).map((m) => ({ id: m.id, value: m.value, cost: m.cost as number }));
  const best = bestByCount(items, budget, cap);
  if (best.size === 0) return [];
  const order: Array<{ strategy: CastStrategy; ks: number[] }> = [
    { strategy: "solo", ks: [1] },
    { strategy: "few", ks: [3, 2] },
    { strategy: "mix", ks: [...Array.from({ length: Math.max(0, cap - 3) }, (_, i) => cap - i), 2].filter((k) => k <= cap) },
  ];
  const picked: Array<{ strategy: CastStrategy; ids: string[]; k: number }> = [];
  for (const o of order) {
    // dentro da estratégia, a melhor entre os tamanhos permitidos que ainda não apareceu
    const options = o.ks
      .map((k) => ({ k, ids: best.get(k) }))
      .filter((x): x is { k: number; ids: string[] } => !!x.ids && !picked.some((p) => sameSet(p.ids, x.ids as string[])));
    if (options.length === 0) continue;
    const value = (ids: string[]) => ids.reduce((s, id) => s + (metrics.find((m) => m.id === id)?.value ?? 0), 0);
    const first = o.strategy === "mix" ? options.reduce((a, b) => (value(b.ids) > value(a.ids) ? b : a)) : options[0];
    picked.push({ strategy: o.strategy, ids: first.ids, k: first.k });
  }
  const totals = picked.map((p) => ({ p, t: evaluateCast(metrics, p.ids, budget) }));
  const minCpm = Math.min(...totals.map((x) => x.t.costPerThousand ?? Infinity));
  const maxReach = Math.max(...totals.map((x) => x.t.reach));
  const maxFit = Math.max(...totals.map((x) => x.t.fit ?? -1));
  return totals.map(({ p, t }) => {
    const reasons: CastReason[] = [];
    const names = t.ids.map((id) => metrics.find((m) => m.id === id)?.name ?? "");
    if (p.strategy === "solo") reasons.push({ code: "solo", params: { name: names[0] ?? "" } });
    else if (p.strategy === "few") reasons.push({ code: "few", params: { n: t.count } });
    else reasons.push({ code: "mix", params: { n: t.count } });
    reasons.push({ code: "uses_budget", params: { pct: t.usedPct } });
    if (totals.length > 1 && t.costPerThousand !== null && t.costPerThousand === minCpm) reasons.push({ code: "lowest_cpm" });
    if (totals.length > 1 && t.reach === maxReach) reasons.push({ code: "highest_reach" });
    if (totals.length > 1 && t.fit !== null && t.fit === maxFit) reasons.push({ code: "best_fit", params: { pct: Math.round(t.fit * 100) } });
    if (t.stale.length > 0) reasons.push({ code: "has_stale", params: { n: t.stale.length } });
    return { strategy: p.strategy, totals: t, reasons };
  });
}

/** Aviso quando não há elenco possível: nenhum Hero elegível cabe no orçamento. */
export function whyNoSuggestion(metrics: HeroMetrics[], budget: number): "no_budget" | "no_eligible" | "none_fits" {
  if (!(budget > 0)) return "no_budget";
  const el = metrics.filter((m) => m.eligible);
  if (el.length === 0) return "no_eligible";
  return "none_fits";
}

/**
 * Repartição do valor entre o elenco (modelo fixo): proporcional ao cachê de referência de cada Hero e somando
 * EXATAMENTE o total; Hero sem referência recebe pela média dos outros; sem nenhuma referência, divide igual.
 */
export function splitCastFees(total: number, refs: Array<number | null>): number[] {
  const known = refs.filter((r): r is number => r !== null && r > 0);
  const avg = known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  return splitProportional(total, refs.map((r) => (r !== null && r > 0 ? r : avg)));
}
