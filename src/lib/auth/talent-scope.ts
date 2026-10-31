// Talento sem página pública (D2, 0065): tem o papel creator só com escopo "talent". Lógica pura
// (testável); a sessão reexporta.
export function isTalentOnly(roles: readonly { role: string; scope_type: string | null }[]): boolean {
  const creator = roles.filter((r) => r.role === "creator");
  return creator.length > 0 && creator.every((r) => r.scope_type === "talent");
}

/** Papéis que valem para as telas do herói: o creator com escopo "talent" (escritório) não reabre a
 *  edição nem o Novo post de um herói (revisão de segurança da etapa B). */
export function heroRoleNames(roles: readonly { role: string; scope_type: string | null }[]): string[] {
  return roles.filter((r) => !(r.role === "creator" && r.scope_type === "talent")).map((r) => r.role);
}

export function hasHeroRole(roles: readonly { role: string; scope_type: string | null }[]): boolean {
  return heroRoleNames(roles).includes("creator");
}
