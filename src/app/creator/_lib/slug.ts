// Slug único para novos conteúdos: título normalizado + sufixo aleatório curto.
// O admin pode ajustar depois; a personalidade não altera slug (coluna protegida).
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60)
    // depois do corte: o 60º caractere pode ser um separador, e "…-" + "-sufixo" vira hífen duplo
    .replace(/-+$/, "");
}

export function uniqueSlug(title: string): string {
  const base = slugify(title) || "conteudo";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}
