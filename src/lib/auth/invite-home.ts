// Para onde vai quem acabou de aceitar convite(s) no login (puro, testável). O primeiro convite aceito
// manda; um item com erro (ex.: já é de outra agência) é ignorado.
// 0097: todo convite de Hero (Hero novo, equipe de um Hero, ficha do casting) leva ao Portal do Hero (/heroi);
// sem Hero ainda, à Equipe do portal (Criar meu Hero). Convites antigos com papel 'creator' seguem iguais.
// 0091: onboarding (empresa a criar) → passo a passo; admin → painel; consumidor → início do app.

export type AcceptedInvitation = {
  role?: string;
  scope_type?: string;
  scope_id?: string;
  talent_id?: string;
  kind?: string;
  onboarding?: string;
  error?: string;
};

export const HERO_PORTAL_HOME = "/heroi";
export const ONBOARDING_HOME = "/primeiro-acesso";
// sem Hero ainda: o início do portal mostra "Criar meu Hero" (a Equipe do portal)
export const HERO_TEAM_HOME = HERO_PORTAL_HOME;

const HOME_BY_SCOPE: Record<string, string> = {
  agency: "/agencia",
  brand: "/marca",
  seller_org: "/seller",
  professional: "/profissional",
  talent: HERO_PORTAL_HOME,
  creator: HERO_PORTAL_HOME,
  hero: HERO_PORTAL_HOME,
  hero_team: HERO_PORTAL_HOME,
  onboarding: ONBOARDING_HOME,
  consumer: "/",
};

function homeFor(item: AcceptedInvitation): string | null {
  if (item.talent_id) return HERO_PORTAL_HOME;
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
