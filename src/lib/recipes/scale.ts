// Ajuste de porções (ServingsScaler). Puro: o servidor renderiza com o fator da URL (?porcoes=4,
// vale para impressão e sem JS) e o cliente recalcula ao tocar em − e +. Só itens com quantidade
// numérica mudam; texto livre ("3 colheres") e "a gosto" ficam como estão, com o aviso.
import type { RecipeUnit } from "./codes";

export const SERVINGS_MIN = 1;
export const SERVINGS_MAX = 50;

/** Unidades de massa e volume: 2 algarismos significativos acima de 10 (g e ml em múltiplos de 5). */
const MASS_VOLUME: readonly RecipeUnit[] = ["g", "kg", "mg", "ml", "l"];
/** Medidas de cozinha: o quarto mais próximo (1/4, 1/2, 3/4). */
const SPOONS: readonly RecipeUnit[] = ["cup", "tbsp", "tsp"];

export function clampServings(n: number): number {
  if (!Number.isFinite(n)) return SERVINGS_MIN;
  return Math.min(SERVINGS_MAX, Math.max(SERVINGS_MIN, Math.round(n)));
}

/** ?porcoes=4 → 4; fora de 1..50, decimal ou lixo → null (a receita fica nas porções originais). */
export function parseServingsParam(raw: string | string[] | undefined | null): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{1,3}$/.test(value)) return null;
  const n = Number(value);
  return n >= SERVINGS_MIN && n <= SERVINGS_MAX ? n : null;
}

/** Fator de escala; sem porções na receita não há o que ajustar. */
export function servingsFactor(base: number | null | undefined, target: number | null | undefined): number {
  if (!base || base < 1 || !target) return 1;
  return clampServings(target) / base;
}

function roundSignificant(value: number, digits: number): number {
  if (value === 0) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = 10 ** (digits - 1 - magnitude);
  return Math.round(value * factor) / factor;
}

export type ScaledQuantity = { quantity: number; approx: boolean };

/**
 * Quantidade ajustada pelo fator, arredondada para a cozinha:
 * - massa e volume acima de 10: 2 algarismos significativos; g e ml em múltiplos de 5;
 *   até 10: uma casa (g, mg, ml) ou duas (kg, L);
 * - xícara e colheres: o quarto mais próximo (mínimo 1/4);
 * - contagem e as demais unidades: meio mais próximo (mínimo 1/2).
 * `approx` marca quando o arredondamento afastou o número do cálculo exato (mostra "≈").
 * Fator 1 devolve o número do chef sem mexer.
 */
export function scaleQuantity(quantity: number, unit: RecipeUnit | null, factor: number): ScaledQuantity {
  if (!(factor > 0) || Math.abs(factor - 1) < 1e-9) return { quantity, approx: false };
  const exact = quantity * factor;
  let rounded: number;
  if (unit && MASS_VOLUME.includes(unit)) {
    if (exact > 10) {
      rounded = roundSignificant(exact, 2);
      if ((unit === "g" || unit === "ml") && rounded < 100) rounded = Math.max(5, Math.round(rounded / 5) * 5);
    } else {
      const places = unit === "kg" || unit === "l" ? 100 : 10;
      rounded = Math.max(1 / places, Math.round(exact * places) / places);
    }
  } else if (unit && SPOONS.includes(unit)) {
    rounded = Math.max(0.25, Math.round(exact * 4) / 4);
  } else {
    rounded = Math.max(0.5, Math.round(exact * 2) / 2);
  }
  rounded = Math.round(rounded * 1000) / 1000;
  return { quantity: rounded, approx: Math.abs(rounded - exact) / exact > 0.01 };
}

/** Endereço com o novo número de porções (o original sai da URL). */
export function servingsHref(pathname: string, search: string, servings: number, base: number | null): string {
  const sp = new URLSearchParams(search);
  if (base !== null && servings === base) sp.delete("porcoes");
  else sp.set("porcoes", String(clampServings(servings)));
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
