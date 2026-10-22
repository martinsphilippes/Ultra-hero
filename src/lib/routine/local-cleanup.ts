// Limpeza única dos registros locais do Hoje antigo (hidratação e descanso digitados), que ficavam
// só no navegador em "uh:today:*". O novo Hoje não aceita digitação: apagamos no aparelho, uma vez,
// sem ler o conteúdo e sem enviar nada ao servidor. Puro e tolerante a storage ausente/que lança.

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export const LEGACY_TODAY_PREFIX = "uh:today:";
/** Marcador de que a limpeza já rodou neste aparelho. */
export const LEGACY_TODAY_MARKER = "uh:today:migrated";

/** Apaga as chaves antigas e grava o marcador. Devolve quantas chaves saíram (0 se já rodou). */
export function clearLegacyTodayStorage(storage: StorageLike | null | undefined): number {
  if (!storage) return 0;
  try {
    if (storage.getItem(LEGACY_TODAY_MARKER) === "1") return 0;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(LEGACY_TODAY_PREFIX) && key !== LEGACY_TODAY_MARKER) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    storage.setItem(LEGACY_TODAY_MARKER, "1");
    return keys.length;
  } catch {
    // modo privado ou dados do site bloqueados: nada a limpar
    return 0;
  }
}
