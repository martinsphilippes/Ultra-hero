// Link para a loja oficial de um produto (attributes.external_url). Puro: só aceita URL https
// absoluta e bem formada; qualquer outra coisa (http, javascript:, texto solto) vira null e o
// link não é renderizado.

const MAX_LENGTH = 2048;

/** Devolve a URL normalizada quando é https válida; null caso contrário. */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
  return url.href;
}

/** Lê attributes.external_url de um produto (jsonb livre) com a mesma validação. */
export function officialStoreUrl(attributes: unknown): string | null {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return null;
  return safeExternalUrl((attributes as Record<string, unknown>).external_url);
}
