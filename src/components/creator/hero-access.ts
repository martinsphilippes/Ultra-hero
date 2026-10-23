// Quem vê o topo do herói ("Editar perfil") no /profile: a mesma regra do layout do portal do herói
// (requireRole("creator"), admin também passa). Ter linha em creator_profiles não basta: quem perdeu
// o papel continua vinculado ao perfil, mas não pode voltar a editá-lo pela tela Perfil.
export function heroProfileFor<T>(roles: readonly string[], profile: T | null): T | null {
  return roles.includes("creator") || roles.includes("admin") ? profile : null;
}
