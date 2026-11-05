import { Compass, ShoppingBag, SquarePlay, User, Users } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

// Itens da navegação principal do consumidor (módulo puro: testável sem next/navigation).
export type NavKey = "home" | "explore" | "personalities" | "shop" | "profile";

export type NavItem = {
  key: NavKey;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Some no app das lojas (compras simuladas; docs/decisions/app-nas-lojas.md). */
  webOnly?: boolean;
};

// Exatamente 5 abas: a Evolução virou uma seção do Perfil (/profile/evolution) e Comprar leva à loja.
export const NAV_ITEMS: readonly NavItem[] = [
  // Hero vem primeiro (pedido do responsável): é onde todo login chega. Ícones escolhidos por ele:
  // duas pessoas (Hero, de volta ao ícone original) e play em quadrado (Social).
  { key: "personalities", href: "/personalities", icon: Users },
  { key: "home", href: "/inicio", icon: SquarePlay },
  { key: "explore", href: "/explore", icon: Compass },
  // Comprar: todos os produtos da loja (compras simuladas), antes do Perfil.
  { key: "shop", href: "/shop", icon: ShoppingBag, webOnly: true },
  { key: "profile", href: "/profile", icon: User },
];

/** Aba Portal: a tela de escolha, para quem tem mais de um portal. */
export const PORTAL_CHOOSER_PATH = "/portais";
const PORTAL_PATHS = [PORTAL_CHOOSER_PATH, "/heroi", "/agencia", "/marca", "/admin", "/seller", "/profissional", "/projetos"];

/** Destino da aba Portal: nenhum portal, sem aba; um, direto nele; mais de um, a escolha. */
export function portalNavHref(portals: readonly string[]): string | null {
  if (portals.length === 0) return null;
  return portals.length === 1 ? portals[0] : PORTAL_CHOOSER_PATH;
}

/** Destino do item: no Coming soon da aba Comprar a entrada é Colecionáveis (a Loja segue em /shop). */
export function navHref(key: NavKey, href: string, shopSoon: boolean): string {
  return key === "shop" && shopSoon ? "/shop/colecionaveis" : href;
}

function underPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isPortalPath(pathname: string): boolean {
  return PORTAL_PATHS.some((path) => underPath(pathname, path));
}

export function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  // Configurações abrem pelo avatar e pelo Perfil: a aba Perfil segue ativa lá
  if (href === "/profile" && underPath(pathname, "/configuracoes")) return true;
  return underPath(pathname, href);
}
