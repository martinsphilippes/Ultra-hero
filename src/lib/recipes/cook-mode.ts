// Modo Cozinha (fase 4): regras puras para o servidor, o navegador e os testes. Ajuste de porções vindo
// da URL (?porcoes=), modelo das etapas com os ingredientes de cada uma, navegação por teclado/gesto,
// cronômetro pelo horário de término e o progresso guardado no aparelho por 24 h.
import { METRIC_UNITS, type RecipeUnit } from "./codes";
import { formatIngredientAmount, type UnitLabels } from "./view-model";
import type { RecipeIngredientRow, RecipeRows } from "./rows";
import { recipeMediaUrl } from "./media";

// ---------------------------------------------------------------- porções
export const MIN_SERVINGS = 1;

/** Endereço do Modo Cozinha levando o ajuste de porções da página da receita. */
export function cookModeHref(slug: string, servings: string | null | undefined): string {
  const base = `/content/${slug}/cozinha`;
  return servings && /^\d{1,3}$/.test(servings) ? `${base}?porcoes=${servings}` : base;
}

/** Volta à receita completa com o mesmo ajuste de porções. */
export function recipeHref(slug: string, servings: number | null): string {
  return servings ? `/content/${slug}?porcoes=${servings}` : `/content/${slug}`;
}
export const MAX_SERVINGS = 50;

/** Porções pedidas na URL; sem porção-base, inválidas ou iguais à base valem como "sem ajuste" (null). */
export function parseServingsParam(raw: string | string[] | null | undefined, base: number | null): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!base || value === null || value === undefined || !/^\d{1,3}$/.test(value.trim())) return null;
  const n = Number(value.trim());
  if (n < MIN_SERVINGS || n > MAX_SERVINGS || n === base) return null;
  return n;
}

const SPOON_UNITS: readonly RecipeUnit[] = ["tsp", "tbsp", "cup"];

function twoSignificant(v: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / magnitude) * magnitude;
}

/**
 * Quantidade multiplicada e arredondada como numa cozinha: massa e volume com 2 algarismos
 * significativos acima de 10 (g e ml em múltiplos de 5), colheres e xícaras no quarto mais próximo,
 * contagens em meia unidade. `approx` marca quando o arredondamento mudou o número (mostra "≈").
 */
export function scaleQuantity(quantity: number, unit: RecipeUnit | null, factor: number): { quantity: number; approx: boolean } {
  if (factor === 1) return { quantity, approx: false };
  const raw = quantity * factor;
  let rounded: number;
  if (unit !== null && METRIC_UNITS.includes(unit)) {
    if (raw > 10) {
      rounded = twoSignificant(raw);
      if (unit === "g" || unit === "ml") rounded = Math.max(5, Math.round(rounded / 5) * 5);
    } else {
      rounded = Math.max(0.1, Math.round(raw * 10) / 10);
    }
  } else if (unit !== null && SPOON_UNITS.includes(unit)) {
    rounded = Math.max(0.25, Math.round(raw * 4) / 4);
  } else {
    rounded = Math.max(0.5, Math.round(raw * 2) / 2);
  }
  rounded = Math.round(rounded * 1000) / 1000;
  return { quantity: rounded, approx: Math.abs(rounded - raw) > 1e-6 };
}

// ---------------------------------------------------------------- modelo do Modo Cozinha
export type CookIngredient = {
  id: string;
  name: string;
  /** Quantidade já com o fator de porções ("600 g"); null para "a gosto". */
  amount: string | null;
  approx: boolean;
  toTaste: boolean;
  optional: boolean;
  note: string | null;
  /** Texto livre ou "a gosto" com porções ajustadas: aparece "não ajustado automaticamente". */
  notScaled: boolean;
};

export type CookStep = {
  id: string;
  number: number;
  instruction: string;
  durationSeconds: number | null;
  temperatureC: number | null;
  tip: string | null;
  image: { src: string; alt: string } | null;
  ingredients: CookIngredient[];
};

export type CookModel = {
  contentId: string;
  slug: string;
  title: string;
  baseServings: number | null;
  /** Porções ajustadas pela URL (null = as da receita). */
  servings: number | null;
  steps: CookStep[];
  ingredients: CookIngredient[];
};

function cookIngredient(i: RecipeIngredientRow, factor: number, labels: UnitLabels, locale: string): CookIngredient {
  if (i.to_taste) return { id: i.id, name: i.name, amount: null, approx: false, toTaste: true, optional: i.optional, note: i.note, notScaled: factor !== 1 };
  if (i.quantity !== null) {
    const scaled = scaleQuantity(i.quantity, i.unit, factor);
    return {
      id: i.id,
      name: i.name,
      amount: formatIngredientAmount(scaled.quantity, i.unit, null, labels, locale),
      approx: scaled.approx,
      toTaste: false,
      optional: i.optional,
      note: i.note,
      notScaled: false,
    };
  }
  return {
    id: i.id,
    name: i.name,
    amount: formatIngredientAmount(null, null, i.quantity_text, labels, locale),
    approx: false,
    toTaste: false,
    optional: i.optional,
    note: i.note,
    notScaled: factor !== 1,
  };
}

export function buildCookModel(
  rows: Pick<RecipeRows, "details" | "ingredients" | "steps" | "stepIngredients" | "media">,
  opts: { contentId: string; slug: string; title: string; labels: UnitLabels; locale?: string; servings: number | null },
): CookModel {
  const base = rows.details?.servings ?? null;
  const servings = base ? opts.servings : null;
  const factor = base && servings ? servings / base : 1;
  const locale = opts.locale ?? "pt-BR";
  const ingredients = [...rows.ingredients].sort((a, b) => a.position - b.position).map((i) => cookIngredient(i, factor, opts.labels, locale));
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const order = new Map(ingredients.map((i, index) => [i.id, index]));
  const media = new Map(rows.media.map((m) => [m.id, m]));
  return {
    contentId: opts.contentId,
    slug: opts.slug,
    title: opts.title,
    baseServings: base,
    servings,
    ingredients,
    steps: [...rows.steps]
      .sort((a, b) => a.position - b.position)
      .map((s, index) => {
        const image = s.image_media_id ? media.get(s.image_media_id) : undefined;
        return {
          id: s.id,
          number: index + 1,
          instruction: s.instruction,
          durationSeconds: s.duration_seconds,
          temperatureC: s.temperature_c,
          tip: s.tip,
          image: image ? { src: recipeMediaUrl(image.id), alt: image.alt_text?.trim() || "" } : null,
          // na ordem da lista de ingredientes, como a pessoa vê na receita
          ingredients: rows.stepIngredients
            .filter((l) => l.step_id === s.id)
            .map((l) => byId.get(l.ingredient_id))
            .filter((v): v is CookIngredient => Boolean(v))
            .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
        };
      }),
  };
}

// ---------------------------------------------------------------- navegação
export type CookNav = "next" | "prev" | "first" | "last";

export function clampStep(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), total - 1);
}

export function applyNav(index: number, nav: CookNav, total: number): number {
  if (nav === "next") return clampStep(index + 1, total);
  if (nav === "prev") return clampStep(index - 1, total);
  if (nav === "first") return 0;
  return clampStep(total - 1, total);
}

/** Tecla → navegação. Dentro de campo de texto ou com modificador (atalho do navegador) não navega. */
export function keyToNav(event: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; targetTag?: string | null }): CookNav | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  const tag = (event.targetTag ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return null;
  switch (event.key) {
    case "ArrowRight":
    case "PageDown":
      return "next";
    case "ArrowLeft":
    case "PageUp":
      return "prev";
    case "Home":
      return "first";
    case "End":
      return "last";
    default:
      return null;
  }
}

/** Deslizar o dedo: horizontal e longo o bastante (rolar a tela na vertical não troca a etapa). */
export function swipeToNav(dx: number, dy: number, minDistance = 60): CookNav | null {
  if (Math.abs(dx) < minDistance || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? "next" : "prev";
}

// ---------------------------------------------------------------- cronômetro (horário de término)
export type CookTimer = { stepId: string; durationMs: number; endsAt: number };

/** O alvo é um horário absoluto: o tempo continua certo com a tela bloqueada ou a aba em segundo plano. */
export function startTimer(stepId: string, durationSeconds: number, now: number): CookTimer {
  const durationMs = Math.max(1, Math.round(durationSeconds)) * 1000;
  return { stepId, durationMs, endsAt: now + durationMs };
}

export function timerRemainingMs(timer: Pick<CookTimer, "endsAt">, now: number): number {
  return Math.max(0, timer.endsAt - now);
}

export function timerDone(timer: Pick<CookTimer, "endsAt">, now: number): boolean {
  return now >= timer.endsAt;
}

/** "05:00", "1:02:03". Arredonda para cima: "00:00" só quando terminou de fato. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Ao reabrir: alarme só para o que terminou há pouco; o resto aparece como "terminou", em silêncio. */
export const ALARM_GRACE_MS = 5 * 60 * 1000;
export function shouldAlarmOnRestore(timer: Pick<CookTimer, "endsAt">, now: number): boolean {
  return now >= timer.endsAt && now - timer.endsAt <= ALARM_GRACE_MS;
}

// ---------------------------------------------------------------- progresso no aparelho (24 h)
export const COOK_PROGRESS_TTL_MS = 24 * 60 * 60 * 1000;
export const COOK_SOUND_KEY = "uh-cook-sound";

export const COOK_STORAGE_PREFIX = "uh-cook:";

/** Uma chave por conta e receita: quem entra depois no mesmo aparelho não herda o progresso de outra conta. */
export function cookStorageKey(userId: string, contentId: string): string {
  return `${COOK_STORAGE_PREFIX}${userId}:${contentId}`;
}

/**
 * Chaves do Modo Cozinha que devem sair do aparelho: vencidas (mais de 24 h), ilegíveis e as do formato
 * antigo, sem a conta (`uh-cook:<receita>`), que qualquer conta no aparelho leria.
 */
export function staleCookKeys(entries: readonly (readonly [string, string | null])[], now: number): string[] {
  return entries
    .filter(([key, raw]) => {
      if (!key.startsWith(COOK_STORAGE_PREFIX)) return false;
      if (key.slice(COOK_STORAGE_PREFIX.length).split(":").length !== 2) return true;
      let savedAt: unknown;
      try {
        savedAt = raw ? (JSON.parse(raw) as { savedAt?: unknown })?.savedAt : undefined;
      } catch {
        return true;
      }
      return typeof savedAt !== "number" || now - savedAt > COOK_PROGRESS_TTL_MS;
    })
    .map(([key]) => key);
}

export type CookProgress = { step: number; done: string[]; timers: CookTimer[] };
export const EMPTY_COOK_PROGRESS: CookProgress = { step: 0, done: [], timers: [] };

export function serializeCookProgress(progress: CookProgress, now: number): string {
  return JSON.stringify({ v: 1, savedAt: now, step: progress.step, done: progress.done, timers: progress.timers });
}

/**
 * Lê o progresso guardado: descarta depois de 24 h, ids de etapas que não existem mais (a receita
 * pode ter mudado) e qualquer coisa malformada. Nunca lança.
 */
export function parseCookProgress(raw: string | null | undefined, now: number, stepIds: readonly string[]): CookProgress {
  if (!raw) return EMPTY_COOK_PROGRESS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_COOK_PROGRESS;
  }
  if (!data || typeof data !== "object") return EMPTY_COOK_PROGRESS;
  const d = data as Record<string, unknown>;
  if (d.v !== 1 || typeof d.savedAt !== "number" || now - d.savedAt > COOK_PROGRESS_TTL_MS || d.savedAt - now > 60_000) return EMPTY_COOK_PROGRESS;
  const valid = new Set(stepIds);
  const done = Array.isArray(d.done) ? [...new Set(d.done.filter((id): id is string => typeof id === "string" && valid.has(id)))] : [];
  const timers = Array.isArray(d.timers)
    ? d.timers
        .filter(
          (t): t is CookTimer =>
            Boolean(t) &&
            typeof t === "object" &&
            typeof (t as CookTimer).stepId === "string" &&
            valid.has((t as CookTimer).stepId) &&
            Number.isFinite((t as CookTimer).durationMs) &&
            (t as CookTimer).durationMs > 0 &&
            Number.isFinite((t as CookTimer).endsAt) &&
            // alvo absurdo (relógio adiantado, valor forjado) não vira cronômetro de dias
            (t as CookTimer).endsAt - now <= (t as CookTimer).durationMs + 60_000,
        )
        .map((t) => ({ stepId: t.stepId, durationMs: t.durationMs, endsAt: t.endsAt }))
    : [];
  const uniqueTimers = [...new Map(timers.map((t) => [t.stepId, t])).values()];
  const step = typeof d.step === "number" ? clampStep(d.step, stepIds.length) : 0;
  return { step, done, timers: uniqueTimers };
}

export function toggleDone(done: readonly string[], stepId: string): string[] {
  return done.includes(stepId) ? done.filter((id) => id !== stepId) : [...done, stepId];
}
