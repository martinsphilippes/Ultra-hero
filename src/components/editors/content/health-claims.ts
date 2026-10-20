// Guarda educativa de alegações de saúde: AVISA (não bloqueia) quando o texto usa termos
// que sugerem cura, emagrecimento garantido, diagnóstico ou tratamento. O conteúdo da
// plataforma é educativo e nunca prescrição individual.

const PATTERNS: { term: string; regex: RegExp }[] = [
  // pt-BR
  { term: "cura", regex: /\bcura(r|do|da|tivo|tiva)?\b/ },
  { term: "emagrece", regex: /\bemagrec\w*/ },
  { term: "garantido", regex: /\bgaranti(do|da|a|r)\w*/ },
  { term: "milagre", regex: /\bmilagr\w*/ },
  { term: "trata", regex: /\btrata(r|mento|mentos)?\b/ },
  { term: "diagnóstico", regex: /\bdiagnostic\w*/ },
  // en
  { term: "cure", regex: /\bcures?\b/ },
  { term: "guaranteed", regex: /\bguarantee[ds]?\b/ },
  { term: "miracle", regex: /\bmiracle\w*/ },
  { term: "treats", regex: /\btreat(s|ment)\b/ },
  { term: "diagnosis", regex: /\bdiagnos(is|e)\w*/ },
  { term: "lose weight", regex: /\blose weight\b|\bweight loss\b/ },
  // es
  { term: "adelgaza", regex: /\badelgaz\w*/ },
  { term: "garantizado", regex: /\bgarantiza\w*/ },
];

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Extrai todo texto de um corpo estruturado (recursivo) para análise. */
export function collectText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectText);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(collectText);
  return [];
}

/** Termos encontrados (sem repetição), na ordem da lista. Vazio = nenhum alerta. */
export function findHealthClaims(texts: string[]): string[] {
  const haystack = fold(texts.join(" \n "));
  const found: string[] = [];
  for (const { term, regex } of PATTERNS) {
    if (regex.test(haystack) && !found.includes(term)) found.push(term);
  }
  return found;
}
