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

/** Só o Adm da agência (e o admin geral) vê valores: contrato, cachê, comissão, financeiro.
 *  Exceção (0139): a aba Projeção do Financeiro mostra somas (nunca negócio a negócio) para todo membro. */
export function canSeeValues(role: AgencyRole | null, platformAdmin = false): boolean {
  return agencyCan(role, "admin", platformAdmin);
}

// ---------------------------------------------------------------- menus por papel (6.2 e 6.3)
export const AGENCY_NAV = ["dashboard", "approvals", "heroes", "pipeline", "tasks", "agenda", "sponsorships", "strategies", "casting", "brands", "ondaDigital", "groupProjects", "notifications", "settings", "team", "finance", "history", "profile"] as const;
export type AgencyNavKey = (typeof AGENCY_NAV)[number];

/** Itens do menu da agência (P1a: + Pipeline para todos, o colaborador vê só os negócios dele;
 *  Configurações gestor+; Equipe só o Adm). */
export function agencyNavKeys(role: AgencyRole | null, platformAdmin = false, opts: { groscove?: boolean; presidency?: boolean } = {}): AgencyNavKey[] {
  // Estratégias para marcas (0111): banco de ideias mensal — todo membro propõe; Estratégia/Adm aprovam
  const keys: AgencyNavKey[] = ["dashboard", "pipeline", "tasks", "agenda", "strategies", "casting", "brands", "notifications"];
  // Aprovação de cadastros (0141): só a Presidência (o banco confere de novo em cada leitura e decisão)
  if (opts.presidency) keys.splice(1, 0, "approvals");
  // Heros (0070): gestor+ cria os perfis e publica em nome deles
  if (agencyCan(role, "manager", platformAdmin)) keys.splice(1, 0, "heroes");
  // Patrocínio (0085): gestor+ publica e decide; as respostas das marcas não são do colaborador
  if (agencyCan(role, "manager", platformAdmin)) keys.splice(keys.indexOf("agenda") + 1, 0, "sponsorships");
  // Onda Digital (0132): os pedidos das marcas chegam só à Groscove
  if (opts.groscove || platformAdmin) keys.splice(keys.indexOf("brands") + 1, 0, "ondaDigital");
  // Plano de projetos (0137): os projetos do grupo, só para a equipe da Groscove
  if (opts.groscove || platformAdmin) keys.splice(keys.indexOf("ondaDigital") + 1, 0, "groupProjects");
  if (agencyCan(role, "manager", platformAdmin)) keys.push("settings");
  // Adm: equipe e histórico (auditoria da agência). Financeiro: o Adm vê tudo; gestor e equipe entram só na aba
  // Projeção (0139, decisão do dono em 08/11/2026)
  if (agencyCan(role, "admin", platformAdmin)) keys.push("team");
  if (role || platformAdmin) keys.push("finance");
  if (agencyCan(role, "admin", platformAdmin)) keys.push("history");
  // Meu cadastro (0125): cada colaborador revê o próprio cadastro PJ (CNPJ, cargo, nível)
  if (role) keys.push("profile");
  return keys;
}

export const BRAND_NAV = ["dashboard", "ondaDigital", "board", "campaigns", "library", "catalog", "agenda", "sponsorships", "payments", "team", "notifications"] as const;
export type BrandNavKey = (typeof BRAND_NAV)[number];

export function brandNavKeys(): BrandNavKey[] {
  // Ações por etapa (0078): painel de todas as ações das campanhas, logo depois do Início
  // Biblioteca (0083): conteúdos aprovados com o vencimento do direito de uso, logo depois de Campanhas
  // Oportunidades de patrocínio (0085): logo depois da Agenda
  // Pagamentos (0090): o que a marca deve à agência e "Informar pagamento", logo depois de Patrocínios
  // Onda Digital (0132): o produto da Groscove explicado para a marca, logo depois do Início
  return ["dashboard", "ondaDigital", "board", "campaigns", "library", "catalog", "agenda", "sponsorships", "payments", "team", "notifications"];
}

/** Papel mínimo de cada rota restrita da agência (o layout do segmento redireciona para /agencia). */
export const AGENCY_ROUTE_MIN: Record<string, AgencyRole> = {
  "/agencia/casting/novo": "manager",
  "/agencia/pipeline/novo": "manager",
  "/agencia/equipe": "admin",
  "/agencia/configuracoes": "manager",
  "/agencia/herois": "manager",
  // 0139: todo membro entra (gestor e equipe só na aba Projeção; a página leva quem não é Adm para lá)
  "/agencia/financeiro": "staff",
  "/agencia/historico": "admin",
  "/agencia/oportunidades": "manager",
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
