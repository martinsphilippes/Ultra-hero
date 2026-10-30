// Operação dos fornecedores (lógica pura, sem servidor).
// Decisão do responsável: o cadastro/login de fornecedor não existe por enquanto; tudo o que o
// fornecedor fazia (produtos, remessas, perfil da organização) é feito pelo admin em /admin/sellers e
// /admin/shipments. O código do portal /seller fica guardado: voltar = trocar esta constante para true.
export const SELLER_PORTAL_ENABLED: boolean = false;

export type SellerPortalAccess = "portal" | "admin" | "closed";

/** Quem abre /seller/*: com o portal ligado, segue; desligado, o admin vai ao admin e os demais veem o aviso. */
export function sellerPortalAccess(isAdmin: boolean, enabled: boolean = SELLER_PORTAL_ENABLED): SellerPortalAccess {
  if (enabled) return "portal";
  return isAdmin ? "admin" : "closed";
}

/** Contas de demonstração mostradas no painel de acesso rápido: sem o portal, a do fornecedor sai. */
export function visibleDemoKinds<K extends string>(kinds: readonly K[], enabled: boolean = SELLER_PORTAL_ENABLED): K[] {
  return kinds.filter((k) => enabled || k !== "seller");
}

/** Papéis com atalho de portal no Perfil (o fornecedor só quando o portal está ligado). */
export function portalRolesShown<R extends string>(roles: readonly R[], enabled: boolean = SELLER_PORTAL_ENABLED): R[] {
  return roles.filter((r) => enabled || r !== "seller");
}

// ---------------------------------------------------------------- abas da organização no admin
export const SELLER_HUB_TABS = ["overview", "products", "shipments", "organization"] as const;
export type SellerHubTab = (typeof SELLER_HUB_TABS)[number];

const TAB_SEGMENT: Record<SellerHubTab, string> = { overview: "", products: "/products", shipments: "/shipments", organization: "/organization" };

export function sellerHubHref(orgId: string, tab: SellerHubTab): string {
  return `/admin/sellers/${orgId}${TAB_SEGMENT[tab]}`;
}

/** Aba ativa a partir do caminho (subpáginas de produto/remessa marcam a aba da lista). */
export function activeSellerHubTab(pathname: string, orgId: string): SellerHubTab {
  const base = `/admin/sellers/${orgId}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  for (const tab of SELLER_HUB_TABS) {
    const seg = TAB_SEGMENT[tab];
    if (seg && (rest === seg || rest.startsWith(`${seg}/`))) return tab;
  }
  return "overview";
}
