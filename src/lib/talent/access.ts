// Acesso do creator ao escritório, visto pela agência (0087; lógica pura, testável).
// "login": o talento tem login próprio OU o Hero ligado tem conta; "pending": convite do escritório
// pendente e no prazo; "none": sem login. O e-mail vem mascarado do banco (a agência nunca lê auth.users).

export const TALENT_ACCESS = ["login", "pending", "none"] as const;
export type TalentAccess = (typeof TALENT_ACCESS)[number];

export type TalentAccessInfo = { access: TalentAccess; loginEmail: string | null; inviteExpiresAt: string | null };

export function toTalentAccess(value: unknown): TalentAccess {
  return typeof value === "string" && (TALENT_ACCESS as readonly string[]).includes(value) ? (value as TalentAccess) : "none";
}

/**
 * Acesso de um talento. Sem a leitura do banco (migração ainda não aplicada), cai no que a linha do
 * talento diz: login próprio conta; o Hero ligado é desconhecido (null = não mostra selo).
 */
export function resolveTalentAccess(info: TalentAccessInfo | undefined, talent: { userId: string | null }): TalentAccess | null {
  if (info) return info.access;
  return talent.userId ? "login" : null;
}

/** O gestor+ pode convidar? Ficha ativa, agência real, e ninguém com login ainda (com ou sem Hero). */
export function canInviteCreator(input: { access: TalentAccess | null; canEdit: boolean; locked: boolean; heroActive: boolean; hasHero: boolean }): boolean {
  if (!input.canEdit || input.locked) return false;
  if (input.access === "login") return false;
  // Hero ligado e fora do ar (suspenso/pendente): o banco recusa; sem selo conhecido, não oferece
  if (input.hasHero && (!input.heroActive || input.access === null)) return false;
  return true;
}

/** Variante do selo (Badge) por acesso. */
export function talentAccessVariant(access: TalentAccess): "success" | "warning" | "neutral" {
  return access === "login" ? "success" : access === "pending" ? "warning" : "neutral";
}
