// Slug único para novos conteúdos: título normalizado + sufixo aleatório curto.
// O admin pode ajustar depois; a personalidade não altera slug (coluna protegida).
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function uniqueSlug(title: string): string {
  const base = slugify(title) || "conteudo";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}
