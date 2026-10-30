// Slug de produto criado pela operação: nome sem acentos + sufixo curto (unicidade; nova tentativa em colisão).

export function slugifyTitle(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function productSlug(title: string, random: () => number = Math.random): string {
  const suffix = random().toString(36).slice(2, 6).padEnd(4, "0");
  return `${slugifyTitle(title) || "produto"}-${suffix}`;
}
