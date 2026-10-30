import { Compass, Home, User, Users } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

// Itens da navegação principal do consumidor (módulo puro: testável sem next/navigation).
export type NavKey = "home" | "explore" | "personalities" | "profile";

export type NavItem = {
  key: NavKey;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

// Exatamente 4 abas: a Evolução virou uma seção do Perfil (/profile/evolution).
export const NAV_ITEMS: readonly NavItem[] = [
  // Hero vem primeiro (pedido do responsável): é onde todo login chega.
  { key: "personalities", href: "/personalities", icon: Users },
  { key: "home", href: "/inicio", icon: Home },
  { key: "explore", href: "/explore", icon: Compass },
  { key: "profile", href: "/profile", icon: User },
];

export function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
