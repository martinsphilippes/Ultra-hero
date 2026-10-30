// Indicadores do admin (Etapa 5, 0060): regras puras, sem servidor nem banco, testadas em unidade.
// Tudo aqui é agregado: nenhuma linha traz pessoa (id, e-mail, nome de cliente) — LGPD.
import { LIBRARY_KEYS, type LibraryKey } from "@/lib/catalog/creator-libraries";

// ---------------------------------------------------------------- seções e período
export const INDICATOR_SECTIONS = ["herois", "atalhos", "conversao", "profissionais", "colecionaveis", "ranking"] as const;
export type IndicatorSection = (typeof INDICATOR_SECTIONS)[number];

export const INDICATOR_PERIODS = ["7", "30", "90"] as const;
export type IndicatorPeriod = (typeof INDICATOR_PERIODS)[number];

export function parseIndicatorSection(raw: unknown): IndicatorSection {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (INDICATOR_SECTIONS as readonly unknown[]).includes(value) ? (value as IndicatorSection) : "herois";
}

export function parseIndicatorPeriod(raw: unknown): IndicatorPeriod {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (INDICATOR_PERIODS as readonly unknown[]).includes(value) ? (value as IndicatorPeriod) : "30";
}

export function indicatorsHref(section: IndicatorSection, period: IndicatorPeriod): string {
  return `/admin/indicadores?secao=${section}&days=${period}`;
}

export function indicatorsExportHref(section: IndicatorSection, period: IndicatorPeriod): string {
  return `/admin/indicadores/export?secao=${section}&days=${period}`;
}

/** RPC(s) de cada seção. O ranking dos heróis sai da mesma leitura da seção Por herói. */
export const SECTION_RPCS = {
  herois: ["admin_indicators_heroes"],
  atalhos: ["admin_indicators_shortcuts"],
  conversao: ["admin_indicators_conversion"],
  profissionais: ["admin_indicators_professionals"],
  colecionaveis: ["admin_indicators_collectibles"],
  ranking: ["admin_indicators_ranking", "admin_indicators_heroes"],
} as const satisfies Record<IndicatorSection, readonly string[]>;

/** Banco sem a 0060: a função não existe (PostgREST PGRST202 ou Postgres 42883). */
export function isMissingRpc(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return /could not find the function|function .* does not exist/i.test(error.message ?? "");
}

// ---------------------------------------------------------------- leitura defensiva do jsonb
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);
export const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export type DailyPoint = { day: string; value: number };
const daily = (v: unknown): DailyPoint[] => arr(v).map((d) => ({ day: str(d.day), value: num(d.value) })).filter((d) => d.day !== "");

// ---------------------------------------------------------------- por herói
export type HeroIndicator = {
  id: string;
  slug: string;
  name: string;
  status: string;
  followers: number;
  newFollowers: number;
  contentViews: number;
  programViews: number;
  recipeFazer: number;
  recipeComprarPronto: number;
  recipeListaCompras: number;
  proVerPerfil: number;
  proContratar: number;
  shortcutOpens: number;
  collectibleBids: number;
  collectibleViews: number;
};
export type HeroesData = { rows: HeroIndicator[]; dailyFollows: DailyPoint[] };

export function parseHeroes(raw: unknown): HeroesData {
  const o = obj(raw);
  return {
    rows: arr(o.rows).map((r) => ({
      id: str(r.id),
      slug: str(r.slug),
      name: str(r.name),
      status: str(r.status),
      followers: num(r.followers),
      newFollowers: num(r.new_followers),
      contentViews: num(r.content_views),
      programViews: num(r.program_views),
      recipeFazer: num(r.recipe_fazer),
      recipeComprarPronto: num(r.recipe_comprar_pronto),
      recipeListaCompras: num(r.recipe_lista_compras),
      proVerPerfil: num(r.pro_ver_perfil),
      proContratar: num(r.pro_contratar),
      shortcutOpens: num(r.shortcut_opens),
      collectibleBids: num(r.collectible_bids),
      collectibleViews: num(r.collectible_views),
    })),
    dailyFollows: daily(o.daily_follows),
  };
}

/** Toques na receita (fazer + comprar pronto + lista de compras). */
export const recipeTaps = (h: HeroIndicator) => h.recipeFazer + h.recipeComprarPronto + h.recipeListaCompras;
/** Visualizações (conteúdo + programa + colecionável). */
export const heroViews = (h: HeroIndicator) => h.contentViews + h.programViews + h.collectibleViews;
/** Ações do herói no período: tudo que a pessoa fez nele (seguir, ver, tocar, abrir atalho, dar lance). */
export const heroActions = (h: HeroIndicator) =>
  h.newFollowers + heroViews(h) + recipeTaps(h) + h.proVerPerfil + h.proContratar + h.shortcutOpens + h.collectibleBids;

export function heroTotals(rows: HeroIndicator[]) {
  const sum = (f: (h: HeroIndicator) => number) => rows.reduce((acc, h) => acc + f(h), 0);
  return {
    followers: sum((h) => h.followers),
    newFollowers: sum((h) => h.newFollowers),
    views: sum(heroViews),
    recipeTaps: sum(recipeTaps),
    proTaps: sum((h) => h.proVerPerfil + h.proContratar),
    shortcutOpens: sum((h) => h.shortcutOpens),
    collectibleBids: sum((h) => h.collectibleBids),
  };
}

/** Top heróis por ações (só quem teve alguma). Empate: mais seguidores, depois nome. */
export function rankHeroes(rows: HeroIndicator[], limit = 10): { hero: HeroIndicator; actions: number }[] {
  return rows
    .map((hero) => ({ hero, actions: heroActions(hero) }))
    .filter((r) => r.actions > 0)
    .sort((a, b) => b.actions - a.actions || b.hero.followers - a.hero.followers || a.hero.name.localeCompare(b.hero.name, "pt-BR"))
    .slice(0, limit);
}

// ---------------------------------------------------------------- por atalho
export type ShortcutsData = {
  trackingSince: string | null;
  bySource: { sourceKey: LibraryKey; opens: number; heroes: number }[];
  byHero: { slug: string; name: string; sourceKey: LibraryKey; opens: number }[];
  daily: DailyPoint[];
};
const isLibraryKey = (v: unknown): v is LibraryKey => (LIBRARY_KEYS as readonly unknown[]).includes(v);

export function parseShortcuts(raw: unknown): ShortcutsData {
  const o = obj(raw);
  return {
    trackingSince: str(o.tracking_since) || null,
    bySource: arr(o.by_source)
      .filter((r) => isLibraryKey(r.source_key))
      .map((r) => ({ sourceKey: r.source_key as LibraryKey, opens: num(r.opens), heroes: num(r.heroes) })),
    byHero: arr(o.by_hero)
      .filter((r) => isLibraryKey(r.source_key))
      .map((r) => ({ slug: str(r.slug), name: str(r.name), sourceKey: r.source_key as LibraryKey, opens: num(r.opens) })),
    daily: daily(o.daily),
  };
}

/** Atalho aberto (POST /api/shortcut-opens): herói (uuid) + fonte conhecida. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type ShortcutOpen = { creatorId: string; sourceKey: LibraryKey };
export function parseShortcutOpen(input: unknown): ShortcutOpen | null {
  if (typeof input !== "object" || input === null) return null;
  const { creatorId, sourceKey } = input as Record<string, unknown>;
  if (typeof creatorId !== "string" || !UUID.test(creatorId)) return null;
  if (!isLibraryKey(sourceKey)) return null;
  return { creatorId: creatorId.toLowerCase(), sourceKey };
}

// ---------------------------------------------------------------- conversão
export type RecipeConversion = {
  slug: string;
  title: string;
  views: number;
  fazer: number;
  listaCompras: number;
  comprarPronto: number;
  hasReadyProduct: boolean;
  readyCartAdds: number;
  readyOrderedQty: number;
};
export type ProgramConversion = { slug: string; title: string; views: number; enrolled: number; completed: number };
export type ConversionData = {
  recipeFunnel: { views: number; fazer: number; listaCompras: number; comprarPronto: number; readyCartAdds: number; readyOrderedQty: number };
  recipes: RecipeConversion[];
  programFunnel: { views: number; enrolled: number; completed: number };
  programs: ProgramConversion[];
  shopFunnel: { productViews: number; cartAdds: number; checkouts: number; testOrders: number; testOrdersTotalCents: number };
};

export function parseConversion(raw: unknown): ConversionData {
  const o = obj(raw);
  const rf = obj(o.recipe_funnel);
  const pf = obj(o.program_funnel);
  const sf = obj(o.shop_funnel);
  return {
    recipeFunnel: {
      views: num(rf.views),
      fazer: num(rf.fazer),
      listaCompras: num(rf.lista_compras),
      comprarPronto: num(rf.comprar_pronto),
      readyCartAdds: num(rf.ready_cart_adds),
      readyOrderedQty: num(rf.ready_ordered_qty),
    },
    recipes: arr(o.recipes).map((r) => ({
      slug: str(r.slug),
      title: str(r.title),
      views: num(r.views),
      fazer: num(r.fazer),
      listaCompras: num(r.lista_compras),
      comprarPronto: num(r.comprar_pronto),
      hasReadyProduct: r.has_ready_product === true,
      readyCartAdds: num(r.ready_cart_adds),
      readyOrderedQty: num(r.ready_ordered_qty),
    })),
    programFunnel: { views: num(pf.views), enrolled: num(pf.enrolled), completed: num(pf.completed) },
    programs: arr(o.programs).map((p) => ({ slug: str(p.slug), title: str(p.title), views: num(p.views), enrolled: num(p.enrolled), completed: num(p.completed) })),
    shopFunnel: {
      productViews: num(sf.product_views),
      cartAdds: num(sf.cart_adds),
      checkouts: num(sf.checkouts),
      testOrders: num(sf.test_orders),
      testOrdersTotalCents: num(sf.test_orders_total_cents),
    },
  };
}

// ---------------------------------------------------------------- profissionais
export const SERVICE_ORDER_STATUSES = ["pending", "accepted", "scheduled", "completed", "declined", "cancelled"] as const;
export type ServiceOrderStatus = (typeof SERVICE_ORDER_STATUSES)[number];
type StatusCounts = Record<ServiceOrderStatus, number>;
const statusCounts = (r: Obj): StatusCounts =>
  Object.fromEntries(SERVICE_ORDER_STATUSES.map((s) => [s, num(r[s])])) as StatusCounts;

export type ProfessionalIndicator = {
  slug: string;
  name: string;
  specialty: string;
  status: string;
  orders: number;
  byStatus: StatusCounts;
  revenueCents: number;
  medianResponseMinutes: number | null;
  tapsVerPerfil: number;
  tapsContratar: number;
};
export type ProfessionalsData = {
  totals: { orders: number; byStatus: StatusCounts; revenueCents: number; medianResponseMinutes: number | null; tapsVerPerfil: number; tapsContratar: number };
  professionals: ProfessionalIndicator[];
  services: { title: string; professional: string; orders: number; completed: number; revenueCents: number }[];
};

export function parseProfessionals(raw: unknown): ProfessionalsData {
  const o = obj(raw);
  const t = obj(o.totals);
  return {
    totals: {
      orders: num(t.orders),
      byStatus: statusCounts(t),
      revenueCents: num(t.revenue_cents),
      medianResponseMinutes: numOrNull(t.median_response_minutes),
      tapsVerPerfil: num(t.taps_ver_perfil),
      tapsContratar: num(t.taps_contratar),
    },
    professionals: arr(o.professionals).map((p) => ({
      slug: str(p.slug),
      name: str(p.name),
      specialty: str(p.specialty),
      status: str(p.status),
      orders: num(p.orders),
      byStatus: statusCounts(p),
      revenueCents: num(p.revenue_cents),
      medianResponseMinutes: numOrNull(p.median_response_minutes),
      tapsVerPerfil: num(p.taps_ver_perfil),
      tapsContratar: num(p.taps_contratar),
    })),
    services: arr(o.services).map((s) => ({
      title: str(s.title),
      professional: str(s.professional),
      orders: num(s.orders),
      completed: num(s.completed),
      revenueCents: num(s.revenue_cents),
    })),
  };
}

// ---------------------------------------------------------------- colecionáveis
export const COLLECTIBLE_STATUSES = ["live", "scheduled", "ended", "cancelled", "draft"] as const;
export const CONTACT_STATUSES = ["pending", "contacted", "delivered"] as const;
export type CollectibleItem = {
  title: string;
  hero: string;
  status: string;
  endsAt: string | null;
  totalBids: number;
  bids: number;
  views: number;
  finalCents: number | null;
  outcome: string | null;
  contactStatus: string;
  isDemo: boolean;
};
export type CollectiblesData = {
  status: Record<(typeof COLLECTIBLE_STATUSES)[number], number>;
  contact: Record<(typeof CONTACT_STATUSES)[number], number>;
  bids: number;
  views: number;
  won: number;
  noBids: number;
  finalCents: number;
  items: CollectibleItem[];
};

export function parseCollectibles(raw: unknown): CollectiblesData {
  const o = obj(raw);
  const s = obj(o.status);
  const c = obj(o.contact);
  return {
    status: Object.fromEntries(COLLECTIBLE_STATUSES.map((k) => [k, num(s[k])])) as CollectiblesData["status"],
    contact: Object.fromEntries(CONTACT_STATUSES.map((k) => [k, num(c[k])])) as CollectiblesData["contact"],
    bids: num(o.bids),
    views: num(o.views),
    won: num(o.won),
    noBids: num(o.no_bids),
    finalCents: num(o.final_cents),
    items: arr(o.items).map((i) => ({
      title: str(i.title),
      hero: str(i.hero),
      status: str(i.status),
      endsAt: str(i.ends_at) || null,
      totalBids: num(i.total_bids),
      bids: num(i.bids),
      views: num(i.views),
      finalCents: numOrNull(i.final_cents),
      outcome: str(i.outcome) || null,
      contactStatus: str(i.contact_status) || "none",
      isDemo: i.is_demo === true,
    })),
  };
}

// ---------------------------------------------------------------- ranking
export type RankingData = {
  recipes: { slug: string; title: string; actions: number; fazer: number; comprarPronto: number; listaCompras: number }[];
  programs: { slug: string; title: string; enrolled: number; views: number }[];
  products: { slug: string; title: string; cartAdds: number; views: number }[];
};

export function parseRanking(raw: unknown): RankingData {
  const o = obj(raw);
  return {
    recipes: arr(o.recipes).map((r) => ({
      slug: str(r.slug),
      title: str(r.title),
      actions: num(r.actions),
      fazer: num(r.fazer),
      comprarPronto: num(r.comprar_pronto),
      listaCompras: num(r.lista_compras),
    })),
    programs: arr(o.programs).map((p) => ({ slug: str(p.slug), title: str(p.title), enrolled: num(p.enrolled), views: num(p.views) })),
    products: arr(o.products).map((p) => ({ slug: str(p.slug), title: str(p.title), cartAdds: num(p.cart_adds), views: num(p.views) })),
  };
}

// ---------------------------------------------------------------- gráficos
/** Parte do todo (0..1) ou null quando o todo é zero. */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** Largura da barra em % (0..100). Valor > 0 nunca some (mínimo 2%). */
export function barPercent(value: number, max: number): number {
  if (!(value > 0) || !(max > 0)) return 0;
  return Math.min(100, Math.max(2, (value / max) * 100));
}

/** Soma de uma série diária. */
export const sumDaily = (points: DailyPoint[]) => points.reduce((acc, p) => acc + p.value, 0);

// ---------------------------------------------------------------- CSV
export type CsvCell = string | number | boolean | null | undefined;

/** Uma célula: aspas quando precisa; texto que começa com = + - @ (fórmula na planilha) ganha ' na frente. */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return `${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

/** Formato longo (bloco, chave, rótulo, métrica, valor): igual para todas as seções, fácil de pivotar. */
export const CSV_HEADER = ["block", "key", "label", "metric", "value"] as const;
type Row = [string, string, string, string, CsvCell];
const metrics = (block: string, key: string, label: string, values: Record<string, CsvCell>): Row[] =>
  Object.entries(values).map(([metric, value]) => [block, key, label, metric, value]);

export type SectionData = {
  herois: HeroesData;
  atalhos: ShortcutsData;
  conversao: ConversionData;
  profissionais: ProfessionalsData;
  colecionaveis: CollectiblesData;
  ranking: { ranking: RankingData; heroes: HeroesData };
};

export function sectionCsvRows<S extends IndicatorSection>(section: S, data: SectionData[S]): Row[] {
  switch (section) {
    case "herois": {
      const d = data as HeroesData;
      return [
        ...d.rows.flatMap((h) =>
          metrics("hero", h.slug, h.name, {
            followers: h.followers,
            new_followers: h.newFollowers,
            content_views: h.contentViews,
            program_views: h.programViews,
            recipe_fazer: h.recipeFazer,
            recipe_comprar_pronto: h.recipeComprarPronto,
            recipe_lista_compras: h.recipeListaCompras,
            professional_ver_perfil: h.proVerPerfil,
            professional_contratar: h.proContratar,
            shortcut_opens: h.shortcutOpens,
            collectible_bids: h.collectibleBids,
            collectible_views: h.collectibleViews,
          }),
        ),
        ...d.dailyFollows.map((p): Row => ["daily_follows", p.day, p.day, "new_followers", p.value]),
      ];
    }
    case "atalhos": {
      const d = data as ShortcutsData;
      return [
        ...d.bySource.flatMap((s) => metrics("source", s.sourceKey, s.sourceKey, { opens: s.opens, heroes: s.heroes })),
        ...d.byHero.map((h): Row => ["hero_source", `${h.slug}/${h.sourceKey}`, h.name, "opens", h.opens]),
        ...d.daily.map((p): Row => ["daily", p.day, p.day, "opens", p.value]),
      ];
    }
    case "conversao": {
      const d = data as ConversionData;
      const rf = d.recipeFunnel;
      const sf = d.shopFunnel;
      return [
        ...metrics("recipe_funnel", "total", "total", {
          views: rf.views,
          fazer: rf.fazer,
          lista_compras: rf.listaCompras,
          comprar_pronto: rf.comprarPronto,
          ready_cart_adds: rf.readyCartAdds,
          ready_ordered_qty: rf.readyOrderedQty,
        }),
        ...d.recipes.flatMap((r) =>
          metrics("recipe", r.slug, r.title, {
            views: r.views,
            fazer: r.fazer,
            lista_compras: r.listaCompras,
            comprar_pronto: r.comprarPronto,
            ready_cart_adds: r.readyCartAdds,
            ready_ordered_qty: r.readyOrderedQty,
          }),
        ),
        ...metrics("program_funnel", "total", "total", { views: d.programFunnel.views, enrolled: d.programFunnel.enrolled, completed: d.programFunnel.completed }),
        ...d.programs.flatMap((p) => metrics("program", p.slug, p.title, { views: p.views, enrolled: p.enrolled, completed: p.completed })),
        ...metrics("shop_funnel", "total", "total", {
          product_views: sf.productViews,
          cart_adds: sf.cartAdds,
          checkouts: sf.checkouts,
          test_orders: sf.testOrders,
          test_orders_total_cents_simulated: sf.testOrdersTotalCents,
        }),
      ];
    }
    case "profissionais": {
      const d = data as ProfessionalsData;
      const t = d.totals;
      return [
        ...metrics("total", "total", "total", {
          orders: t.orders,
          ...t.byStatus,
          revenue_cents_simulated: t.revenueCents,
          median_response_minutes: t.medianResponseMinutes,
          taps_ver_perfil: t.tapsVerPerfil,
          taps_contratar: t.tapsContratar,
        }),
        ...d.professionals.flatMap((p) =>
          metrics("professional", p.slug, p.name, {
            specialty: p.specialty,
            orders: p.orders,
            ...p.byStatus,
            revenue_cents_simulated: p.revenueCents,
            median_response_minutes: p.medianResponseMinutes,
            taps_ver_perfil: p.tapsVerPerfil,
            taps_contratar: p.tapsContratar,
          }),
        ),
        ...d.services.flatMap((s, i) =>
          metrics("service", String(i + 1), `${s.title} · ${s.professional}`, { orders: s.orders, completed: s.completed, revenue_cents_simulated: s.revenueCents }),
        ),
      ];
    }
    case "colecionaveis": {
      const d = data as CollectiblesData;
      return [
        ...metrics("status", "total", "total", d.status),
        ...metrics("contact", "total", "total", d.contact),
        ...metrics("period", "total", "total", { bids: d.bids, views: d.views, won: d.won, no_bids: d.noBids, final_cents_simulated: d.finalCents }),
        ...d.items.flatMap((i, n) =>
          metrics("item", String(n + 1), i.title, {
            hero: i.hero,
            status: i.status,
            ends_at: i.endsAt,
            bids: i.bids,
            total_bids: i.totalBids,
            views: i.views,
            final_cents_simulated: i.finalCents,
            contact_status: i.contactStatus,
          }),
        ),
      ];
    }
    case "ranking": {
      const d = data as SectionData["ranking"];
      return [
        ...rankHeroes(d.heroes.rows).map(({ hero, actions }, i): Row => ["top_heroes", String(i + 1), hero.name, "actions", actions]),
        ...d.ranking.recipes.map((r, i): Row => ["top_recipes", String(i + 1), r.title, "actions", r.actions]),
        ...d.ranking.programs.map((p, i): Row => ["top_programs", String(i + 1), p.title, "enrolled", p.enrolled]),
        ...d.ranking.products.map((p, i): Row => ["top_products", String(i + 1), p.title, "cart_adds", p.cartAdds]),
      ];
    }
  }
  return [];
}

export function sectionCsv<S extends IndicatorSection>(section: S, data: SectionData[S]): string {
  return toCsv(CSV_HEADER, sectionCsvRows(section, data));
}

export function csvFilename(section: IndicatorSection, period: IndicatorPeriod, today: Date = new Date()): string {
  return `groscove-ultra-indicadores-${section}-${period}d-${today.toISOString().slice(0, 10)}.csv`;
}
