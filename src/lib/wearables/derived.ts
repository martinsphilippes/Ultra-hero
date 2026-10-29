// Linha de base pessoal e índices calculados pelo Groscove Ultra (§13.4, RN-07, RN-08).
// Funções puras: as mesmas servem ao gerador de demonstração hoje e à ingestão real no futuro.
// Comparação sempre com a própria pessoa ("dentro/acima/abaixo da sua faixa habitual"),
// nunca com normas populacionais — e nada de "normal/anormal", "risco" ou "alvo" (RN-18).

/** Mínimo de dias/noites válidos para formar a linha de base (RN-07). */
export const BASELINE_MIN_DAYS = 7;
/** Janela da linha de base (dias anteriores a hoje). */
export const BASELINE_WINDOW_DAYS = 28;
/** Fator que torna o MAD comparável a um desvio-padrão. */
const MAD_SCALE = 1.4826;

export type Baseline = {
  /** Mediana dos dias válidos da janela. */
  median: number;
  /** Desvio robusto (MAD × 1,4826), com piso para não virar faixa de largura zero. */
  spread: number;
  low: number;
  high: number;
  /** Dias válidos usados. */
  n: number;
};

export type Comparison = "below" | "within" | "above" | "learning";

const finite = (values: readonly (number | null | undefined)[]): number[] => values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mad(values: readonly number[]): number {
  const med = median(values);
  return median(values.map((v) => Math.abs(v - med)));
}

/**
 * Linha de base de 28 dias: mediana ± 1 desvio robusto. Antes de 7 dias válidos devolve null
 * ("Aprendendo seu normal: n de 7"). `minSpread` evita faixa vazia quando a série é muito estável.
 */
export function baseline(values: readonly (number | null | undefined)[], minSpread = 0): Baseline | null {
  const valid = finite(values).slice(-BASELINE_WINDOW_DAYS);
  if (valid.length < BASELINE_MIN_DAYS) return null;
  const med = median(valid);
  const spread = Math.max(mad(valid) * MAD_SCALE, minSpread);
  return { median: med, spread, low: med - spread, high: med + spread, n: valid.length };
}

export function compare(value: number | null | undefined, base: Baseline | null): Comparison {
  if (base === null || typeof value !== "number" || !Number.isFinite(value)) return "learning";
  if (value < base.low) return "below";
  if (value > base.high) return "above";
  return "within";
}

/** z-score robusto contra a linha de base, limitado a ±2,5 (§13.4). */
export function robustZ(value: number, base: Baseline): number {
  if (!(base.spread > 0)) return 0;
  return Math.max(-2.5, Math.min(2.5, (value - base.median) / base.spread));
}

// ---------------------------------------------------------------- Disposição Groscove Ultra
export type DispositionComponent = "hrv" | "sleep" | "rhr" | "load" | "temp";
export const DISPOSITION_WEIGHTS: Record<DispositionComponent, number> = { hrv: 0.35, sleep: 0.3, rhr: 0.2, load: 0.1, temp: 0.05 };

export type DispositionInput = {
  hrvNight?: number | null;
  hrvHistory?: readonly (number | null)[];
  restingHr?: number | null;
  restingHrHistory?: readonly (number | null)[];
  asleepMin?: number | null;
  asleepHistory?: readonly (number | null)[];
  efficiencyPct?: number | null;
  efficiencyHistory?: readonly (number | null)[];
  loadRatio?: number | null;
  tempDelta?: number | null;
};

export type DispositionBand = "below" | "within" | "above";

export type DispositionResult = {
  /** Escala interna 0–100 (mostrada só no detalhe). */
  score: number;
  /** Faixa exibida no card: abaixo (< 40) / no (40–69) / acima (≥ 70) do seu habitual. */
  band: DispositionBand;
  /** Contribuição de cada componente presente (peso já redistribuído × z). */
  components: { key: DispositionComponent; weight: number; z: number }[];
};

export function dispositionBand(score: number): DispositionBand {
  if (score < 40) return "below";
  if (score >= 70) return "above";
  return "within";
}

/**
 * Exige sono + (VFC noturna ou FC de repouso) e 7 noites de linha de base; senão devolve null e o
 * card não aparece (ex.: Galaxy pelo Health Connect, sem VFC nem FC de repouso).
 */
export function disposition(input: DispositionInput): DispositionResult | null {
  const raw: { key: DispositionComponent; z: number }[] = [];

  const sleepBase = baseline(input.asleepHistory ?? [], 15);
  if (typeof input.asleepMin !== "number" || sleepBase === null) return null;
  let zSleep = robustZ(input.asleepMin, sleepBase);
  const effBase = baseline(input.efficiencyHistory ?? [], 1);
  if (typeof input.efficiencyPct === "number" && effBase) zSleep = (zSleep + robustZ(input.efficiencyPct, effBase)) / 2;

  // VFC em escala log, comparada com o mesmo método e fonte (RN-09).
  const hrvLog = finite(input.hrvHistory ?? []).filter((v) => v > 0).map(Math.log);
  const hrvBase = baseline(hrvLog, 0.04);
  const hasHrv = typeof input.hrvNight === "number" && input.hrvNight > 0 && hrvBase !== null;
  const rhrBase = baseline(input.restingHrHistory ?? [], 1);
  const hasRhr = typeof input.restingHr === "number" && rhrBase !== null;
  if (!hasHrv && !hasRhr) return null;

  if (hasHrv) raw.push({ key: "hrv", z: robustZ(Math.log(input.hrvNight as number), hrvBase) });
  raw.push({ key: "sleep", z: zSleep });
  if (hasRhr) raw.push({ key: "rhr", z: -robustZ(input.restingHr as number, rhrBase) });
  // Carga e temperatura só penalizam (sem prescrever um alvo).
  if (typeof input.loadRatio === "number" && Number.isFinite(input.loadRatio)) raw.push({ key: "load", z: input.loadRatio > 1.3 ? -Math.min(2.5, (input.loadRatio - 1.3) / 0.2) : 0 });
  if (typeof input.tempDelta === "number" && Number.isFinite(input.tempDelta)) {
    const abs = Math.abs(input.tempDelta);
    raw.push({ key: "temp", z: abs > 0.3 ? -Math.min(2.5, (abs - 0.3) / 0.2) : 0 });
  }

  // Ausência redistribui os pesos entre os componentes presentes.
  const total = raw.reduce((sum, c) => sum + DISPOSITION_WEIGHTS[c.key], 0);
  const components = raw.map((c) => ({ key: c.key, weight: DISPOSITION_WEIGHTS[c.key] / total, z: c.z }));
  const sum = components.reduce((acc, c) => acc + c.weight * c.z, 0);
  const score = Math.round(Math.max(0, Math.min(100, 50 + 15 * sum)));
  return { score, band: dispositionBand(score), components };
}

// ---------------------------------------------------------------- Sinais da noite
export type NightVitalsComponent = { code: string; value: number; comparison: Comparison };
export type NightVitalsResult = { components: NightVitalsComponent[]; within: number; total: number };

/** Cada componente presente contra a própria faixa; ausente some; sem linha de base, "aprendendo". */
export function nightVitals(items: readonly { code: string; value: number | null | undefined; history: readonly (number | null)[]; minSpread?: number }[]): NightVitalsResult | null {
  const components: NightVitalsComponent[] = [];
  for (const item of items) {
    if (typeof item.value !== "number" || !Number.isFinite(item.value)) continue;
    components.push({ code: item.code, value: item.value, comparison: compare(item.value, baseline(item.history, item.minSpread ?? 0)) });
  }
  if (components.length === 0) return null;
  const measured = components.filter((c) => c.comparison !== "learning");
  return { components, within: measured.filter((c) => c.comparison === "within").length, total: measured.length };
}

// ---------------------------------------------------------------- carga (TRIMP de Edwards)
/** Σ minutos na zona k × k (k = 1…5), do dia todo, sem contar o treino duas vezes. */
export function edwardsTrimp(zoneMinutes: readonly number[]): number {
  return Math.round(zoneMinutes.slice(0, 5).reduce((sum, minutes, i) => sum + Math.max(0, minutes) * (i + 1), 0));
}

/** Carga aguda (média de 7 dias), crônica (média de 28) e a razão entre elas. */
export function trainingLoad(dailyLoads: readonly number[]): { acute: number; chronic: number; ratio: number | null } {
  const last = (n: number) => dailyLoads.slice(-n);
  const avg = (values: readonly number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  const acute = avg(last(7));
  const chronic = avg(last(28));
  return { acute: Math.round(acute), chronic: Math.round(chronic), ratio: chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : null };
}

// ---------------------------------------------------------------- sono
/** Eficiência: dormindo ÷ (dormindo + acordado) dentro da sessão (Apple não tem "na cama" do relógio). */
export function sleepEfficiency(asleepMin: number, awakeMin: number): number {
  const total = asleepMin + awakeMin;
  return total > 0 ? Math.round((asleepMin / total) * 100) : 0;
}

/**
 * Regularidade 0–100 a partir do desvio do ponto médio do sono nas últimas 13 noites
 * (100 = mesmo horário toda noite; perde ~1 ponto a cada ~1 min de desvio robusto).
 */
export function sleepRegularity(midpointsMin: readonly number[]): number | null {
  const valid = finite(midpointsMin).slice(-13);
  if (valid.length < BASELINE_MIN_DAYS) return null;
  const spread = mad(valid) * MAD_SCALE;
  return Math.round(Math.max(0, Math.min(100, 100 - spread * (100 / 90))));
}

// ---------------------------------------------------------------- estatística para os testes de coerência
export function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}
