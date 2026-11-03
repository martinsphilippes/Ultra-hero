// Para onde vai quem acabou de aceitar convite(s) no login (puro, testável). O primeiro convite aceito
// manda; um item com erro (ex.: já é de outra agência) é ignorado.
// Convite do escritório (0087): o aceite devolve talent_id. Com herói ligado o escopo é "creator" (a conta
// vira dona do herói), mas quem entrou por convite da agência vai direto ao escritório, não ao Perfil.
// 0091: onboarding (empresa a criar) → passo a passo; admin → painel; creator sem herói → Equipe (Criar meu
// herói); consumidor → início do app.

export type AcceptedInvitation = {
  role?: string;
  scope_type?: string;
  scope_id?: string;
  talent_id?: string;
  kind?: string;
  onboarding?: string;
  error?: string;
};

export const OFFICE_HOME = "/creator/escritorio";
export const ONBOARDING_HOME = "/primeiro-acesso";
export const HERO_TEAM_HOME = "/creator/equipe";

const HOME_BY_SCOPE: Record<string, string> = {
  agency: "/agencia",
  brand: "/marca",
  seller_org: "/seller",
  professional: "/profissional",
  talent: OFFICE_HOME,
  creator: "/profile",
  onboarding: ONBOARDING_HOME,
  consumer: "/",
};

function homeFor(item: AcceptedInvitation): string | null {
  if (item.talent_id) return OFFICE_HOME;
  if (item.scope_type === "global") {
    if (item.role === "admin") return "/admin";
    if (item.role === "creator") return HERO_TEAM_HOME;
    return null;
  }
  return item.scope_type ? (HOME_BY_SCOPE[item.scope_type] ?? null) : null;
}

export function portalHomeForAccepted(items: readonly AcceptedInvitation[]): string | null {
  // o passo a passo vem antes de tudo: sem ele a empresa não existe
  if (items.some((i) => !i.error && i.scope_type === "onboarding")) return ONBOARDING_HOME;
  for (const item of items) {
    if (item.error || !item.scope_type) continue;
    const home = homeFor(item);
    if (home) return home;
  }
  return null;
}
