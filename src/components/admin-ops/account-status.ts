// Regras puras da suspensão de conta (Auth Admin API: ban_duration). Usadas pela
// server action e pela página do usuário; testadas em tests/unit/account-status.test.ts.

/** "Para sempre" no Supabase Auth: 100 anos. `none` remove o ban. */
export const BAN_FOREVER = "876000h";
export const BAN_NONE = "none";

/** Suspensa = banned_until no futuro (ban vencido não conta). */
export function isSuspended(bannedUntil: string | null | undefined, now: Date = new Date()): boolean {
  if (!bannedUntil) return false;
  const until = new Date(bannedUntil);
  return !Number.isNaN(until.getTime()) && until.getTime() > now.getTime();
}

/** roles de admin_get_user: [{ role, scope_type, scope_id }] só com papéis ativos. */
export function hasActiveAdminRole(roles: unknown): boolean {
  if (!Array.isArray(roles)) return false;
  return roles.some((r) => Boolean(r) && typeof r === "object" && !Array.isArray(r) && (r as { role?: unknown }).role === "admin");
}

/** ban_duration que devolve o Auth ao estado anterior (usado se a auditoria falhar depois da mudança). */
export function restoreBanDuration(previousBannedUntil: string | null | undefined, now: Date = new Date()): string {
  if (!isSuspended(previousBannedUntil, now)) return BAN_NONE;
  const hours = Math.ceil((new Date(previousBannedUntil as string).getTime() - now.getTime()) / 3_600_000);
  return `${Math.max(1, hours)}h`;
}

export type SuspensionBlock = "self" | "admin" | null;

/** Por que a suspensão não é oferecida (reativar nunca é bloqueado). */
export function suspensionBlock(params: { targetId: string; actorId: string | null | undefined; roles: unknown }): SuspensionBlock {
  if (params.actorId && params.targetId === params.actorId) return "self";
  if (hasActiveAdminRole(params.roles)) return "admin";
  return null;
}
