// "Publicar como hero" (0045): só o admin cria e gerencia conteúdo pelos heróis. Módulo puro
// (cliente e servidor): nomes do cookie/cabeçalho, os 6 atalhos e para onde cada um leva.

/** Último herói escolhido pelo admin (httpOnly; o servidor sempre revalida no banco). */
export const ACTING_HERO_COOKIE = "uh_acting_hero";
/** Cabeçalho que o servidor manda ao PostgREST; o banco só honra para admin com herói ativo. */
export const ACTING_HERO_HEADER = "x-acting-hero";
export const ACTING_HERO_MAX_AGE = 60 * 60 * 24 * 30;

export const HERO_CARDS = ["post", "newContent", "content", "recipes", "links", "dashboard"] as const;
export type HeroCard = (typeof HERO_CARDS)[number];
/**
 * Atalhos mostrados em "Publicar como hero" (decisão do responsável, 01/11/2026): só Novo post, Novo
 * conteúdo e Painel. Conteúdos, receitas e vínculos continuam alcançáveis pelo Painel e pelo menu do
 * portal; os demais valores de HeroCard seguem válidos para "Trocar hero" voltar à mesma tela.
 */
export const HERO_SHORTCUTS = ["post", "newContent", "dashboard"] as const satisfies readonly HeroCard[];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isHeroCard(value: unknown): value is HeroCard {
  return typeof value === "string" && (HERO_CARDS as readonly string[]).includes(value);
}

// Atalho → tela. Conteúdos usam o módulo de conteúdo do admin (já cria para qualquer herói), com o
// herói pré-selecionado; post, receitas, vínculos e painel usam o portal do herói no modo do admin.
export function heroCardHref(card: HeroCard, heroId: string): string {
  const creator = encodeURIComponent(heroId);
  switch (card) {
    case "post":
      return "/creator/post/new";
    case "newContent":
      return `/admin/content/new?creator=${creator}`;
    case "content":
      return `/admin/content?creator=${creator}`;
    case "recipes":
      return "/creator/recipes";
    case "links":
      return "/creator/links";
    case "dashboard":
      return "/creator";
  }
}

/** Em qual atalho a tela atual está (para "Trocar hero" voltar ao mesmo fluxo com o novo herói). */
export function heroCardForPath(pathname: string): HeroCard {
  if (pathname.startsWith("/creator/post")) return "post";
  if (pathname.startsWith("/creator/recipes")) return "recipes";
  if (pathname.startsWith("/creator/links")) return "links";
  if (pathname === "/admin/content/new") return "newContent";
  if (pathname.startsWith("/admin/content")) return "content";
  return "dashboard";
}

/** Endereço do seletor no início do admin, já aberto para o atalho. */
export function heroPickerHref(card: HeroCard): string {
  return `/admin?heroi=${card}#publicar-como-hero`;
}
