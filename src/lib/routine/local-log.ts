// Registro local de hidratação e descanso: fica só no aparelho (Storage do navegador), nunca vai ao
// banco. Decisão de privacidade: a Política diz que não coletamos dados de saúde. Tudo aqui é puro e
// recebe o Storage por parâmetro para ser testável e tolerar modo privado (storage ausente/lança).

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const KEY_PREFIX = "uh:today:";
export const HYDRATION_STEP_ML = 250;
export const HYDRATION_MAX_ML = 6000;
export const HYDRATION_GOAL_DEFAULT_ML = 2000;
export const HYDRATION_GOAL_OPTIONS_ML = [1500, 2000, 2500, 3000] as const;
export const REST_HOURS_STEP = 0.5;
export const REST_HOURS_MAX = 14;

export type RestLog = { rested: boolean; hours: number | null };

const GOAL_KEY = `${KEY_PREFIX}hydration-goal`;

export function hydrationKey(localDate: string): string {
  return `${KEY_PREFIX}${localDate}:hydration`;
}

export function restKey(localDate: string): string {
  return `${KEY_PREFIX}${localDate}:rest`;
}

// Leitura tolerante: JSON corrompido ou storage que lança viram null.
function readJson(storage: StorageLike | null | undefined, key: string): unknown {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw === undefined) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

// Escrita tolerante: devolve false quando o storage não aceita (cota, modo privado).
function writeJson(storage: StorageLike | null | undefined, key: string, value: unknown): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// Arredonda ao passo e limita ao intervalo; valores não numéricos viram o mínimo.
function snap(value: unknown, step: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : min;
  const snapped = Math.round(n / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

export function clampHydration(ml: unknown): number {
  return snap(ml, HYDRATION_STEP_ML, 0, HYDRATION_MAX_ML);
}

export function clampRestHours(hours: unknown): number {
  return snap(hours, REST_HOURS_STEP, 0, REST_HOURS_MAX);
}

// ---------------------------------------------------------------- hidratação
export function readHydration(storage: StorageLike | null | undefined, localDate: string): number {
  const value = readJson(storage, hydrationKey(localDate));
  if (typeof value === "number") return clampHydration(value);
  if (value && typeof value === "object" && "ml" in value) return clampHydration((value as { ml: unknown }).ml);
  return 0;
}

export function writeHydration(storage: StorageLike | null | undefined, localDate: string, ml: number): number {
  const safe = clampHydration(ml);
  writeJson(storage, hydrationKey(localDate), { ml: safe });
  return safe;
}

export function addHydration(storage: StorageLike | null | undefined, localDate: string, deltaMl: number): number {
  return writeHydration(storage, localDate, readHydration(storage, localDate) + deltaMl);
}

export function isHydrationGoal(value: unknown): value is (typeof HYDRATION_GOAL_OPTIONS_ML)[number] {
  return typeof value === "number" && (HYDRATION_GOAL_OPTIONS_ML as readonly number[]).includes(value);
}

export function readHydrationGoal(storage: StorageLike | null | undefined): number {
  const value = readJson(storage, GOAL_KEY);
  return isHydrationGoal(value) ? value : HYDRATION_GOAL_DEFAULT_ML;
}

export function writeHydrationGoal(storage: StorageLike | null | undefined, goalMl: number): number {
  const safe = isHydrationGoal(goalMl) ? goalMl : HYDRATION_GOAL_DEFAULT_ML;
  writeJson(storage, GOAL_KEY, safe);
  return safe;
}

// ---------------------------------------------------------------- descanso
export function readRest(storage: StorageLike | null | undefined, localDate: string): RestLog {
  const value = readJson(storage, restKey(localDate));
  if (!value || typeof value !== "object") return { rested: false, hours: null };
  const record = value as { rested?: unknown; hours?: unknown };
  const hours = typeof record.hours === "number" && Number.isFinite(record.hours) ? clampRestHours(record.hours) : null;
  return { rested: record.rested === true, hours };
}

export function writeRest(storage: StorageLike | null | undefined, localDate: string, log: RestLog): RestLog {
  const safe: RestLog = { rested: Boolean(log.rested), hours: log.hours === null ? null : clampRestHours(log.hours) };
  writeJson(storage, restKey(localDate), safe);
  return safe;
}

// Verifica se o storage funciona de fato (modo privado pode expor a API e lançar ao gravar).
export function storageAvailable(storage: StorageLike | null | undefined): boolean {
  if (!storage) return false;
  try {
    const probe = `${KEY_PREFIX}probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

// Litros com duas casas, no idioma ("0,25 L" / "0.25 L").
export function formatLiters(ml: number, locale: string): string {
  const liters = clampHydration(ml) / 1000;
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(liters)} L`;
}

// Meta curta ("2 L", "1,5 L").
export function formatGoalLiters(ml: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ml / 1000)} L`;
}
