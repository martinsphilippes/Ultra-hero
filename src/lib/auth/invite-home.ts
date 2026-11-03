// Para onde vai quem acabou de aceitar convite(s) no login (puro, testável). O primeiro convite aceito
// manda; um item com erro (ex.: já é de outra agência) é ignorado.
// Convite do escritório (0087): o aceite devolve talent_id. Com herói ligado o escopo é "creator" (a conta
// vira dona do herói), mas quem entrou por convite da agência vai direto ao escritório, não ao Perfil.

export type AcceptedInvitation = { role?: string; scope_type?: string; scope_id?: string; talent_id?: string; error?: string };

export const OFFICE_HOME = "/creator/escritorio";

const HOME_BY_SCOPE: Record<string, string> = {
  agency: "/agencia",
  brand: "/marca",
  seller_org: "/seller",
  professional: "/profissional",
  talent: OFFICE_HOME,
  creator: "/profile",
};

export function portalHomeForAccepted(items: readonly AcceptedInvitation[]): string | null {
  for (const item of items) {
    if (item.error || !item.scope_type) continue;
    if (item.talent_id) return OFFICE_HOME;
    const home = HOME_BY_SCOPE[item.scope_type];
    if (home) return home;
  }
  return null;
}
