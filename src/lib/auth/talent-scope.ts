// Talento sem página pública (D2, 0065): tem o papel creator só com escopo "talent". Lógica pura
// (testável); a sessão reexporta.
export function isTalentOnly(roles: readonly { role: string; scope_type: string | null }[]): boolean {
  const creator = roles.filter((r) => r.role === "creator");
  return creator.length > 0 && creator.every((r) => r.scope_type === "talent");
}
