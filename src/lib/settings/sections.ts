// Configurações (/configuracoes): as linhas que antes ficavam no Perfil, agrupadas em seções.
// Módulo puro (testável): só monta a lista; a página põe ícones e textos. A trava do app das lojas
// (docs/decisions/app-nas-lojas.md) segue igual: a linha some no app (native:hidden) e o middleware
// barra a rota.
import { isBlockedInNativeApp } from "@/lib/native-app/surface";
import { portalRolesShown } from "@/lib/seller-ops/portal";

export const SETTINGS_PATH = "/configuracoes";
export const OFFICE_PATH = "/creator/escritorio";

/** Linhas comuns (textos em me.profile.links.<key>, salvo as marcadas em me.settings.rows). */
export type SettingsLinkKey =
  | "reminders"
  | "heroes"
  | "interests"
  | "favorites"
  | "recipes"
  | "shoppingList"
  | "orders"
  | "account"
  | "notifications"
  | "devices"
  | "appearance";

/** Portais (textos em me.profile.portals); o herói não tem portal (só posta pelo Perfil, 0045).
 *  "office" é o escritório do creator que está num casting (0065; web e app). */
export type SettingsPortalRole = "seller" | "professional" | "office" | "agency" | "brand" | "admin";

export type SettingsSectionKey = "routine" | "collections" | "purchases" | "account" | "portals";

export type SettingsItem =
  | { kind: "link"; key: SettingsLinkKey; href: string; nativeHidden: boolean }
  | { kind: "portal"; key: SettingsPortalRole; href: string; nativeHidden: boolean };

export type SettingsSection = { key: SettingsSectionKey; items: SettingsItem[] };

// "Idioma e tema" abre o editor recolhido do Perfil já na parte "Sua conta" (âncora ACCOUNT_ANCHOR)
const APPEARANCE_HREF = "/profile#dados";

const LINK_SECTIONS: Array<{ key: Exclude<SettingsSectionKey, "portals">; items: Array<[SettingsLinkKey, string]> }> = [
  {
    key: "routine",
    items: [
      ["reminders", "/profile/lembretes"],
      // heróis seguidos e o Hero de comparação (0056)
      ["heroes", "/profile/herois"],
      ["interests", "/profile/interests"],
    ],
  },
  {
    key: "collections",
    items: [
      ["favorites", "/profile/favorites"],
      ["recipes", "/profile/receitas"],
      ["shoppingList", "/profile/lista-de-compras"],
    ],
  },
  {
    key: "purchases",
    items: [["orders", "/orders"]],
  },
  {
    key: "account",
    items: [
      ["account", "/profile/account"],
      ["notifications", "/profile/notifications"],
      ["devices", "/profile/devices"],
      ["appearance", APPEARANCE_HREF],
    ],
  },
];

const PORTALS: Array<{ role: SettingsPortalRole; href: string }> = [
  { role: "seller", href: "/seller" },
  // profissional (0058): pedidos, serviços e perfil público
  { role: "professional", href: "/profissional" },
  // gestão (0064): portal da agência e da marca (só web: somem no app das lojas)
  { role: "agency", href: "/agencia" },
  { role: "brand", href: "/marca" },
  { role: "admin", href: "/admin" },
];

function nativeHidden(href: string): boolean {
  return isBlockedInNativeApp(href.split("#")[0]);
}

export type PortalOptions = {
  /** Está num casting (0065): atalho do Escritório. */
  hasTalent?: boolean;
  /** Admin geral com conta real (is_platform_admin): supervisiona agência e marca. A conta pública de
   *  demonstração com papel admin não ganha esses atalhos (os portais dizem "indisponível" para ela). */
  platformAdmin?: boolean;
};

/** Atalhos dos portais (topo do Perfil e seção Portais das Configurações): os do papel e o Escritório
 *  de quem está num casting. O admin geral de conta real supervisiona os portais de gestão (0064). */
export function buildPortalItems(roles: readonly string[], sellerPortalEnabled?: boolean, opts: PortalOptions = {}): SettingsItem[] {
  const withManagement = roles.includes("admin") && opts.platformAdmin ? [...roles, "agency", "brand"] : roles;
  const shown = portalRolesShown(withManagement, sellerPortalEnabled);
  const portals: SettingsItem[] = PORTALS.filter((p) => shown.includes(p.role)).map((p) => ({ kind: "portal", key: p.role, href: p.href, nativeHidden: nativeHidden(p.href) }));
  if (opts.hasTalent) portals.unshift({ kind: "portal", key: "office", href: OFFICE_PATH, nativeHidden: nativeHidden(OFFICE_PATH) });
  return portals;
}

/** Seções na ordem da tela; seção sem linha não aparece (Portais só com papel ou com talento no casting). */
export function buildSettingsSections(roles: readonly string[], sellerPortalEnabled?: boolean, opts: PortalOptions = {}): SettingsSection[] {
  const sections: SettingsSection[] = LINK_SECTIONS.map(({ key, items }) => ({
    key,
    items: items.map(([k, href]) => ({ kind: "link" as const, key: k, href, nativeHidden: nativeHidden(href) })),
  }));
  const portals = buildPortalItems(roles, sellerPortalEnabled, opts);
  if (portals.length > 0) sections.push({ key: "portals", items: portals });
  return sections;
}

/** Excluir conta: a confirmação mora na página da conta (âncora da seção). */
export const DELETE_ACCOUNT_ANCHOR = "excluir-conta";
export const DELETE_ACCOUNT_HREF = `/profile/account#${DELETE_ACCOUNT_ANCHOR}`;

/** App das lojas: as linhas só da web saem da lista no servidor (esconder por CSS deixava a borda da
 *  última linha visível). */
export function forSurface<T extends { nativeHidden: boolean }>(items: readonly T[], native: boolean): T[] {
  return native ? items.filter((i) => !i.nativeHidden) : [...items];
}
