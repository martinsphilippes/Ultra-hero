// Card de boas-vindas por área (app, Portal do Herói, Portal da Marca, Portal da Agência). Módulo puro: passos, chave
// do "já vi" e regras de onde aparece; usado pelos layouts, pela tela de Configurações, pelo card e pelos testes.
//
// Decisões (sem perguntar ao dono):
// - "Já vi" fica no servidor, no user_metadata da própria conta (supabase.auth.updateUser, que MESCLA as chaves): uma
//   chave por área (uh_welcome_seen_<área> = data ISO). Sem tabela nem coluna nova: account_onboardings é do cadastro
//   por perfil (criar agência/marca/herói), não de "telas vistas".
// - Aparece uma vez no primeiro acesso de cada pessoa a cada área; reabre por "Como funciona" (Configurações), que leva
//   à área com ?como-funciona=1.
// - Não aparece: sem sessão; nas telas /admin (o layout do admin não monta o card; o admin que entra no Portal do Herói
//   pelo "Publicar como hero" ou supervisiona marca/agência sem ser membro também não vê); nas telas da loja em Coming
//   soon (/shop, /cart, /checkout: o aviso da loja é o protagonista ali); nos navegadores de E2E (cookie uh-e2e).
//   Fluxo de cadastro (/login, /primeiro-acesso, /onboarding) fica fora dos layouts que montam o card.

export const WELCOME_AREAS = ["app", "heroi", "marca", "agencia"] as const;
export type WelcomeArea = (typeof WELCOME_AREAS)[number];

export function isWelcomeArea(value: unknown): value is WelcomeArea {
  return typeof value === "string" && (WELCOME_AREAS as readonly string[]).includes(value);
}

/** Chave no user_metadata. */
export function welcomeMetaKey(area: WelcomeArea): string {
  return `uh_welcome_seen_${area}`;
}

/** A pessoa já viu (ou pulou) o card desta área? */
export function hasSeenWelcome(meta: unknown, area: WelcomeArea): boolean {
  if (!meta || typeof meta !== "object") return false;
  const value = (meta as Record<string, unknown>)[welcomeMetaKey(area)];
  return typeof value === "string" ? value.length > 0 : value === true;
}

/** Ícones (nomes do lucide, mapeados no componente). */
export type WelcomeIcon =
  | "users"
  | "heart"
  | "compass"
  | "shoppingBag"
  | "handshake"
  | "calendar"
  | "wallet"
  | "messages"
  | "user"
  | "megaphone"
  | "checkCircle"
  | "contact"
  | "kanban"
  | "scroll"
  | "door";

export type WelcomeStep = { key: string; icon: WelcomeIcon };

// 3–5 passos por área (textos em welcome.areas.<área>.steps.<key>.title/body); o último passo ("Mais novidades em
// breve.") é igual para todos e não entra aqui.
export const WELCOME_STEPS: Record<WelcomeArea, readonly WelcomeStep[]> = {
  app: [
    { key: "heroes", icon: "users" },
    { key: "social", icon: "heart" },
    { key: "explore", icon: "compass" },
    { key: "shop", icon: "shoppingBag" },
  ],
  heroi: [
    { key: "opportunities", icon: "handshake" },
    { key: "deliveries", icon: "checkCircle" },
    { key: "agenda", icon: "calendar" },
    { key: "finance", icon: "wallet" },
    { key: "page", icon: "user" },
  ],
  marca: [
    { key: "campaigns", icon: "megaphone" },
    { key: "hire", icon: "users" },
    { key: "approvals", icon: "checkCircle" },
    { key: "payments", icon: "wallet" },
    { key: "messages", icon: "messages" },
  ],
  agencia: [
    { key: "casting", icon: "contact" },
    { key: "pipeline", icon: "kanban" },
    { key: "scripts", icon: "scroll" },
    { key: "finance", icon: "wallet" },
    { key: "room", icon: "door" },
  ],
};

/** Total de passos do card (os da área + o final). */
export function welcomeStepCount(area: WelcomeArea): number {
  return WELCOME_STEPS[area].length + 1;
}

/** Parâmetro que reabre o card ("Como funciona"). */
export const WELCOME_OPEN_PARAM = "como-funciona";

const AREA_HOME: Record<WelcomeArea, string> = { app: "/personalities", heroi: "/heroi", marca: "/marca", agencia: "/agencia" };

/** Link "Como funciona" de uma área. */
export function welcomeHref(area: WelcomeArea): string {
  return `${AREA_HOME[area]}?${WELCOME_OPEN_PARAM}=1`;
}

/** Telas em que o card não abre sozinho (o Coming soon da loja é o protagonista ali). */
export function welcomeSuppressedOn(pathname: string): boolean {
  return /^\/(?:shop|cart|checkout)(?:\/|$)/.test(pathname);
}

/** Áreas com "Como funciona" nas Configurações: o app para todos; cada portal de gestão para quem é dele. O admin da
 *  plataforma não ganha os portais que só supervisiona. */
export function welcomeAreasFor(input: { roles: readonly string[]; hasTalent?: boolean }): WelcomeArea[] {
  const areas: WelcomeArea[] = ["app"];
  if (input.roles.includes("creator") || input.hasTalent) areas.push("heroi");
  if (input.roles.includes("brand")) areas.push("marca");
  if (input.roles.includes("agency")) areas.push("agencia");
  return areas;
}
