import { Compass, Home, ShoppingBag, User, Users } from "lucide-react";
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
  // Hero vem primeiro (pedido do responsável): é onde todo login chega.
  { key: "personalities", href: "/personalities", icon: Users },
  { key: "home", href: "/inicio", icon: Home },
  { key: "explore", href: "/explore", icon: Compass },
  // Comprar: todos os produtos da loja (compras simuladas), antes do Perfil.
  { key: "shop", href: "/shop", icon: ShoppingBag, webOnly: true },
  { key: "profile", href: "/profile", icon: User },
];

function underPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  // Configurações abrem pelo avatar e pelo Perfil: a aba Perfil segue ativa lá
  if (href === "/profile" && underPath(pathname, "/configuracoes")) return true;
  return underPath(pathname, href);
}
