// Modelos de briefing e duplicar campanha (0080). Lógica pura (testada com vitest).

export const MAX_TEMPLATES = 30;

export function templateNameValid(name: string): boolean {
  const n = name.trim();
  return n.length >= 3 && n.length <= 80;
}

/** Título de rascunho (cópia) cabendo nos 120 caracteres do banco. */
export function clampTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").slice(0, 120);
}
