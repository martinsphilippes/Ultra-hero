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
export const AGENCY_NAV = ["dashboard", "brands", "notifications", "settings", "team"] as const;
export type AgencyNavKey = (typeof AGENCY_NAV)[number];

/** Itens do menu da agência (a Etapa A só tem Início, Marcas, Notificações, Configurações e Equipe). */
export function agencyNavKeys(role: AgencyRole | null, platformAdmin = false): AgencyNavKey[] {
  const keys: AgencyNavKey[] = ["dashboard", "brands", "notifications"];
  if (agencyCan(role, "manager", platformAdmin)) keys.push("settings");
  if (agencyCan(role, "admin", platformAdmin)) keys.push("team");
  return keys;
}

export const BRAND_NAV = ["dashboard", "team", "notifications"] as const;
export type BrandNavKey = (typeof BRAND_NAV)[number];

export function brandNavKeys(): BrandNavKey[] {
  return ["dashboard", "team", "notifications"];
}

/** Papel mínimo de cada rota restrita da agência (o layout do segmento redireciona para /agencia). */
export const AGENCY_ROUTE_MIN: Record<string, AgencyRole> = {
  "/agencia/equipe": "admin",
  "/agencia/configuracoes": "manager",
};

/** Quem a pessoa pode convidar para a equipe da agência: só o Adm, e qualquer nível. */
export function invitableAgencyRoles(role: AgencyRole | null, platformAdmin = false): AgencyRole[] {
  return agencyCan(role, "admin", platformAdmin) ? [...AGENCY_ROLES] : [];
}
