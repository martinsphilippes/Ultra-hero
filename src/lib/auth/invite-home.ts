// Para onde vai quem acabou de aceitar convite(s) no login (puro, testável). O primeiro convite aceito
// manda; um item com erro (ex.: já é de outra agência) é ignorado.

export type AcceptedInvitation = { role?: string; scope_type?: string; scope_id?: string; error?: string };

const HOME_BY_SCOPE: Record<string, string> = {
  agency: "/agencia",
  brand: "/marca",
  seller_org: "/seller",
  professional: "/profissional",
  talent: "/creator/escritorio",
  creator: "/profile",
};

export function portalHomeForAccepted(items: readonly AcceptedInvitation[]): string | null {
  for (const item of items) {
    if (item.error || !item.scope_type) continue;
    const home = HOME_BY_SCOPE[item.scope_type];
    if (home) return home;
  }
  return null;
}
