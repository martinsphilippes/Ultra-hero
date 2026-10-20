// Slug no mesmo espírito da função SQL slugify(): minúsculas, sem acento, só [a-z0-9-].
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Sufixo curto para evitar colisão de slug sem exigir round-trip ao banco.
export function slugWithSuffix(input: string): string {
  const base = slugify(input) || "item";
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}
