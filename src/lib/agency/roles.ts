// Hierarquia de acesso do módulo de gestão (lógica pura, testável). Espelha public.agency_role_rank
// (0064): admin (Adm da agência) > manager (gestor) > staff (colaborador). Só o Adm vê valores.
// Na marca: owner (dono) e staff (equipe).

export const AGENCY_ROLES = ["admin", "manager", "staff"] as const;
export type AgencyRole = (typeof AGENCY_ROLES)[number];

export const BRAND_ROLES = ["owner", "staff"] as const;
export type BrandRole = (typeof BRAND_ROLES)[number];

const RANK: Record<AgencyRole, number> = { staff: 1, manager: 2, admin: 3 };

export function isAgencyRole(value: unknown): value is AgencyRole {
  return typeof value === "string" && (AGENCY_ROLES as readonly string[]).includes(value);
}

export function isBrandRole(value: unknown): value is BrandRole {
  return typeof value === "string" && (BRAND_ROLES as readonly string[]).includes(value);
}

/** O papel alcança pelo menos `min`? (null = não é membro). O admin geral passa como Adm. */
export function agencyCan(role: AgencyRole | null, min: AgencyRole, platformAdmin = false): boolean {
  if (platformAdmin) return true;
  if (!role) return false;
  return RANK[role] >= RANK[min];
}

/** Só o Adm da agência (e o admin geral) vê valores: contrato, cachê, comissão, financeiro. */
export function canSeeValues(role: AgencyRole | null, platformAdmin = false): boolean {
  return agencyCan(role, "admin", platformAdmin);
}

// ---------------------------------------------------------------- menus por papel (6.2 e 6.3)
export const AGENCY_NAV = ["dashboard", "heroes", "pipeline", "tasks", "agenda", "casting", "brands", "notifications", "settings", "team", "finance", "history"] as const;
export type AgencyNavKey = (typeof AGENCY_NAV)[number];

/** Itens do menu da agência (P1a: + Pipeline para todos, o colaborador vê só os negócios dele;
 *  Configurações gestor+; Equipe só o Adm). */
export function agencyNavKeys(role: AgencyRole | null, platformAdmin = false): AgencyNavKey[] {
  const keys: AgencyNavKey[] = ["dashboard", "pipeline", "tasks", "agenda", "casting", "brands", "notifications"];
  // Heróis (0070): gestor+ cria os perfis e publica em nome deles
  if (agencyCan(role, "manager", platformAdmin)) keys.splice(1, 0, "heroes");
  if (agencyCan(role, "manager", platformAdmin)) keys.push("settings");
  // Adm: equipe, financeiro simulado e histórico (auditoria da agência)
  if (agencyCan(role, "admin", platformAdmin)) keys.push("team", "finance", "history");
  return keys;
}

export const BRAND_NAV = ["dashboard", "campaigns", "catalog", "agenda", "team", "notifications"] as const;
export type BrandNavKey = (typeof BRAND_NAV)[number];

export function brandNavKeys(): BrandNavKey[] {
  return ["dashboard", "campaigns", "catalog", "agenda", "team", "notifications"];
}

/** Papel mínimo de cada rota restrita da agência (o layout do segmento redireciona para /agencia). */
export const AGENCY_ROUTE_MIN: Record<string, AgencyRole> = {
  "/agencia/casting/novo": "manager",
  "/agencia/pipeline/novo": "manager",
  "/agencia/equipe": "admin",
  "/agencia/configuracoes": "manager",
  "/agencia/herois": "manager",
  "/agencia/financeiro": "admin",
  "/agencia/historico": "admin",
};

/** Quem mexe num negócio: gestor+ sempre; o colaborador só quando é responsável ou está na equipe dele. */
export function canWorkDeal(role: AgencyRole | null, isOwnerOrTeam: boolean, platformAdmin = false): boolean {
  if (agencyCan(role, "manager", platformAdmin)) return true;
  return role === "staff" && isOwnerOrTeam;
}

/** Quem a pessoa pode convidar para a equipe da agência: só o Adm, e qualquer nível. */
export function invitableAgencyRoles(role: AgencyRole | null, platformAdmin = false): AgencyRole[] {
  return agencyCan(role, "admin", platformAdmin) ? [...AGENCY_ROLES] : [];
}
