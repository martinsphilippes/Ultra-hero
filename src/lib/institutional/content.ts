// Estrutura da página institucional (/conheca): só chaves de tradução (messages/<locale>/institutional.json) e o
// endereço real de cada recurso no sistema. Cada item descreve uma funcionalidade que EXISTE hoje (rota citada ao lado);
// pagamentos e compras aparecem como "ainda não ativados". Textos/claims finais dependem de aprovação do responsável.

export const WHAT_ITEMS = ["brand", "hero", "agency", "app"] as const;

export const HOW_STEPS = ["choose", "request", "consult", "terms", "deliver", "report"] as const;

/** Grupos de recursos por perfil; `route` = onde a funcionalidade vive (documentação e teste de existência). */
export const FEATURE_GROUPS = [
  {
    id: "herois",
    ns: "heroes",
    items: [
      { key: "page", route: "/heroi/pagina" },
      { key: "content", route: "/heroi/conteudos" },
      { key: "portal", route: "/heroi" },
      { key: "opportunities", route: "/heroi/oportunidades" },
      { key: "agenda", route: "/heroi/agenda" },
      { key: "finance", route: "/heroi/financeiro" },
    ],
  },
  {
    id: "marcas",
    ns: "brands",
    items: [
      { key: "catalog", route: "/marca/herois" },
      { key: "campaigns", route: "/marca/campanhas" },
      { key: "calls", route: "/marca/oportunidades" },
      { key: "sponsorship", route: "/marca/oportunidades" },
      { key: "budget", route: "/marca/pagamentos" },
      { key: "reports", route: "/marca/campanhas/[id]/relatorio" },
    ],
  },
  {
    id: "agencia",
    ns: "agency",
    items: [
      { key: "casting", route: "/agencia/casting" },
      { key: "deals", route: "/agencia/pipeline" },
      { key: "castBuilder", route: "/agencia/negocios/[id]/herois" },
      { key: "agenda", route: "/agencia/agenda/cultura" },
    ],
  },
  {
    id: "app",
    ns: "app",
    items: [
      { key: "content", route: "/explore" },
      { key: "programs", route: "/explore" },
      { key: "recipes", route: "/explore" },
      { key: "today", route: "/profile/today" },
    ],
  },
] as const;

export const CALENDAR_POINTS = ["territories", "interest", "where"] as const;

export const FAQ_ITEMS = ["cost", "payments", "access", "devices", "data"] as const;

/** Âncoras da navegação interna (ordem da página). */
export const SECTION_ANCHORS = [
  { id: "como-funciona", labelKey: "how.title" },
  { id: "herois", labelKey: "heroes.title" },
  { id: "marcas", labelKey: "brands.title" },
  { id: "agencia", labelKey: "agency.title" },
  { id: "app", labelKey: "app.title" },
  { id: "calendario", labelKey: "calendar.title" },
  { id: "perguntas", labelKey: "faq.title" },
] as const;
