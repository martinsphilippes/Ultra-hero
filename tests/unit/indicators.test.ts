import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PORTAL_LINKS } from "@/components/layout/portal-nav";
import {
  barPercent,
  csvCell,
  csvFilename,
  CSV_HEADER,
  heroActions,
  heroTotals,
  indicatorsExportHref,
  indicatorsHref,
  isMissingRpc,
  parseCollectibles,
  parseConversion,
  parseHeroes,
  parseIndicatorPeriod,
  parseIndicatorSection,
  parseProfessionals,
  parseRanking,
  parseShortcutOpen,
  parseShortcuts,
  rankHeroes,
  sectionCsv,
  sectionCsvRows,
  share,
  sumDaily,
  toCsv,
  type HeroIndicator,
} from "@/lib/indicators";

// Indicadores (Etapa 5, 0060): leitura defensiva do jsonb das RPCs, somas, ranking e CSV.

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const heroRaw = (over: Record<string, unknown> = {}) => ({
  id: "533f427b-b2a5-473b-9c6f-73e01501946a",
  slug: "anitta",
  name: "Anitta",
  status: "active",
  followers: 10,
  new_followers: 2,
  content_views: 5,
  program_views: 1,
  recipe_fazer: 3,
  recipe_comprar_pronto: 4,
  recipe_lista_compras: 1,
  pro_ver_perfil: 2,
  pro_contratar: 1,
  shortcut_opens: 7,
  collectible_bids: 1,
  collectible_views: 2,
  ...over,
});

describe("seção e período na URL", () => {
  it("seção desconhecida vira Por herói; período fora de 7/30/90 vira 30", () => {
    expect(parseIndicatorSection("conversao")).toBe("conversao");
    expect(parseIndicatorSection(["ranking", "x"])).toBe("ranking");
    expect(parseIndicatorSection("nada")).toBe("herois");
    expect(parseIndicatorSection(undefined)).toBe("herois");
    expect(parseIndicatorPeriod("7")).toBe("7");
    expect(parseIndicatorPeriod("90")).toBe("90");
    expect(parseIndicatorPeriod("14")).toBe("30");
    expect(parseIndicatorPeriod(null)).toBe("30");
  });

  it("links da seção e do CSV levam seção e período", () => {
    expect(indicatorsHref("atalhos", "7")).toBe("/admin/indicadores?secao=atalhos&days=7");
    expect(indicatorsExportHref("profissionais", "90")).toBe("/admin/indicadores/export?secao=profissionais&days=90");
  });

  it("menu do admin: Indicadores logo depois de Métricas (que continua)", () => {
    const keys = PORTAL_LINKS.admin.map((l) => l.key);
    expect(keys.indexOf("indicators")).toBe(keys.indexOf("metrics") + 1);
    expect(PORTAL_LINKS.admin.find((l) => l.key === "indicators")?.href).toBe("/admin/indicadores");
    expect(PORTAL_LINKS.admin.find((l) => l.key === "metrics")?.href).toBe("/admin/metrics");
  });
});

describe("banco sem a 0060", () => {
  it("função ausente é reconhecida (PostgREST e Postgres); outros erros não", () => {
    expect(isMissingRpc({ code: "PGRST202", message: "Could not find the function public.admin_indicators_heroes(p_days)" })).toBe(true);
    expect(isMissingRpc({ code: "42883", message: "function public.admin_indicators_heroes(integer) does not exist" })).toBe(true);
    expect(isMissingRpc({ message: "Could not find the function x in the schema cache" })).toBe(true);
    expect(isMissingRpc({ code: "42501", message: "forbidden" })).toBe(false);
    expect(isMissingRpc(null)).toBe(false);
  });
});

describe("por herói", () => {
  it("lê o jsonb com defesa: número em texto vira número, lixo vira 0", () => {
    const d = parseHeroes({ rows: [heroRaw({ followers: "12", content_views: "x", collectible_views: null })], daily_follows: [{ day: "2026-10-30", value: 3 }, { value: 1 }] });
    expect(d.rows[0].followers).toBe(12);
    expect(d.rows[0].contentViews).toBe(0);
    expect(d.rows[0].collectibleViews).toBe(0);
    expect(d.dailyFollows).toEqual([{ day: "2026-10-30", value: 3 }]);
    expect(parseHeroes(null)).toEqual({ rows: [], dailyFollows: [], dailyPageViews: [], pageViewsSince: null });
    expect(parseHeroes({ rows: "nope" }).rows).toEqual([]);
  });

  it("ações somam seguir, ver, tocar, abrir atalho e dar lance (seguidores totais ficam fora)", () => {
    const h = parseHeroes({ rows: [heroRaw()] }).rows[0];
    // 2 novos + (5+1+2) views + (3+4+1) receita + (2+1) profissional + 7 atalhos + 1 lance
    expect(heroActions(h)).toBe(29);
    const totals = heroTotals([h, { ...h, followers: 5, shortcutOpens: 0 }]);
    expect(totals).toMatchObject({ followers: 15, newFollowers: 4, views: 16, recipeTaps: 16, proTaps: 6, shortcutOpens: 7, collectibleBids: 2 });
  });

  it("ranking: só quem teve ação, maior primeiro; empate decide seguidores e depois nome", () => {
    const base = parseHeroes({ rows: [heroRaw()] }).rows[0];
    const zero: HeroIndicator = { ...base, id: "z", name: "Zero", newFollowers: 0, contentViews: 0, programViews: 0, recipeFazer: 0, recipeComprarPronto: 0, recipeListaCompras: 0, proVerPerfil: 0, proContratar: 0, shortcutOpens: 0, collectibleBids: 0, collectibleViews: 0 };
    const one = { ...zero, id: "a", name: "Bruna", shortcutOpens: 1, followers: 1 };
    const tieMoreFollowers = { ...zero, id: "b", name: "Carla", shortcutOpens: 1, followers: 9 };
    const tieSameFollowers = { ...zero, id: "c", name: "Ana", shortcutOpens: 1, followers: 1 };
    const ranked = rankHeroes([zero, one, base, tieMoreFollowers, tieSameFollowers]);
    expect(ranked.map((r) => r.hero.name)).toEqual(["Anitta", "Carla", "Ana", "Bruna"]);
    expect(rankHeroes([base, one], 1)).toHaveLength(1);
  });
});

describe("por atalho", () => {
  it("só fontes conhecidas (dia-a-dia, alimentacao, …); data de início opcional", () => {
    const d = parseShortcuts({
      tracking_since: "2026-10-01",
      by_source: [{ source_key: "alimentacao", opens: 4, heroes: 2 }, { source_key: "rotina", opens: 9, heroes: 1 }],
      by_hero: [{ slug: "anitta", name: "Anitta", source_key: "dia-a-dia", opens: 3 }],
      daily: [{ day: "2026-10-30", value: 4 }],
    });
    expect(d.bySource).toEqual([{ sourceKey: "alimentacao", opens: 4, heroes: 2 }]);
    expect(d.byHero[0]).toEqual({ slug: "anitta", name: "Anitta", sourceKey: "dia-a-dia", opens: 3 });
    expect(d.trackingSince).toBe("2026-10-01");
    expect(parseShortcuts({}).trackingSince).toBeNull();
  });

  it("evento de abertura: herói uuid + fonte conhecida; nada além disso", () => {
    expect(parseShortcutOpen({ creatorId: "533F427B-B2A5-473B-9C6F-73E01501946A", sourceKey: "treinos" })).toEqual({ creatorId: "533f427b-b2a5-473b-9c6f-73e01501946a", sourceKey: "treinos" });
    expect(parseShortcutOpen({ creatorId: "533f427b-b2a5-473b-9c6f-73e01501946a", sourceKey: "rotina" })).toBeNull();
    expect(parseShortcutOpen({ creatorId: "nao-uuid", sourceKey: "treinos" })).toBeNull();
    expect(parseShortcutOpen(null)).toBeNull();
    expect(parseShortcutOpen("x")).toBeNull();
  });
});

describe("conversão, profissionais, colecionáveis e ranking", () => {
  it("conversão: funis com zero quando falta campo", () => {
    const d = parseConversion({ recipe_funnel: { views: 10, comprar_pronto: 4, ready_cart_adds: 2 }, recipes: [{ slug: "g1", title: "Bowl", has_ready_product: true, comprar_pronto: 4 }] });
    expect(d.recipeFunnel).toEqual({ views: 10, fazer: 0, listaCompras: 0, comprarPronto: 4, readyCartAdds: 2, readyOrderedQty: 0 });
    expect(d.recipes[0].hasReadyProduct).toBe(true);
    expect(d.programFunnel).toEqual({ views: 0, enrolled: 0, completed: 0 });
    expect(d.shopFunnel.testOrdersTotalCents).toBe(0);
  });

  it("profissionais: contagem por situação e mediana nula sem resposta", () => {
    const d = parseProfessionals({
      totals: { orders: 3, pending: 1, completed: 2, revenue_cents: 36000, median_response_minutes: null },
      professionals: [{ slug: "nina-horta", name: "Nina Horta", specialty: "nutritionist", orders: 3, completed: 2, median_response_minutes: "12.5" }],
    });
    expect(d.totals.byStatus).toEqual({ pending: 1, accepted: 0, scheduled: 0, completed: 2, declined: 0, cancelled: 0 });
    expect(d.totals.medianResponseMinutes).toBeNull();
    expect(d.professionals[0].medianResponseMinutes).toBe(12.5);
    expect(d.services).toEqual([]);
  });

  it("colecionáveis: situação e contato sempre com todas as chaves", () => {
    const d = parseCollectibles({ status: { live: 2 }, contact: { pending: 1 }, items: [{ title: "Camisa", status: "live", final_cents: null, is_demo: true }] });
    expect(d.status).toEqual({ live: 2, scheduled: 0, ended: 0, cancelled: 0, draft: 0 });
    expect(d.contact).toEqual({ pending: 1, contacted: 0, delivered: 0 });
    expect(d.items[0]).toMatchObject({ title: "Camisa", finalCents: null, contactStatus: "none", isDemo: true });
  });

  it("ranking: listas vazias sem dado", () => {
    expect(parseRanking(undefined)).toEqual({ recipes: [], programs: [], products: [] });
    expect(parseRanking({ products: [{ slug: "m2", title: "Marmita", cart_adds: "3", views: 9 }] }).products[0]).toEqual({ slug: "m2", title: "Marmita", cartAdds: 3, views: 9 });
  });
});

describe("gráficos", () => {
  it("parte do todo e largura da barra (valor > 0 nunca some)", () => {
    expect(share(1, 4)).toBe(0.25);
    expect(share(1, 0)).toBeNull();
    expect(barPercent(0, 10)).toBe(0);
    expect(barPercent(5, 10)).toBe(50);
    expect(barPercent(1, 1000)).toBe(2);
    expect(barPercent(20, 10)).toBe(100);
    expect(barPercent(3, 0)).toBe(0);
    expect(sumDaily([{ day: "a", value: 2 }, { day: "b", value: 3 }])).toBe(5);
  });
});

describe("CSV", () => {
  it("aspas quando precisa e proteção contra fórmula na planilha", () => {
    expect(csvCell("Anitta")).toBe("Anitta");
    expect(csvCell('Bowl, "fit"')).toBe('"Bowl, ""fit"""');
    expect(csvCell("linha\nquebrada")).toBe('"linha\nquebrada"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+55")).toBe("'+55");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell(-1)).toBe("-1");
    expect(csvCell(null)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvCell(true)).toBe("true");
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("a,b\n1,x\n");
  });

  it("formato longo igual para todas as seções, sem id de pessoa", () => {
    const heroes = parseHeroes({
      rows: [heroRaw({ page_views: 9 })],
      daily_follows: [{ day: "2026-10-30", value: 2 }],
      daily_page_views: [{ day: "2026-10-30", value: 9 }],
    });
    const csv = sectionCsv("herois", heroes);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(CSV_HEADER.join(","));
    expect(lines).toContain("hero,anitta,Anitta,followers,10");
    expect(lines).toContain("hero,anitta,Anitta,shortcut_opens,7");
    expect(lines).toContain("daily_follows,2026-10-30,2026-10-30,new_followers,2");
    // visitas à página do herói (0061): por herói e por dia
    expect(lines).toContain("hero,anitta,Anitta,page_views,9");
    expect(lines).toContain("daily_page_views,2026-10-30,2026-10-30,page_views,9");
    // o id do herói não vai para o CSV (só slug e nome públicos)
    expect(csv).not.toContain("533f427b");
    expect(lines).toHaveLength(1 + 13 + 1 + 1);
  });

  it("cada seção gera linhas; ranking soma heróis pela mesma regra da tela", () => {
    const heroes = parseHeroes({ rows: [heroRaw()] });
    const ranking = parseRanking({ recipes: [{ slug: "g1", title: "Bowl", actions: 8 }], programs: [{ slug: "p", title: "Base", enrolled: 2 }], products: [{ slug: "m", title: "Marmita", cart_adds: 3 }] });
    expect(sectionCsvRows("ranking", { ranking, heroes })).toEqual([
      ["top_heroes", "1", "Anitta", "actions", 29],
      ["top_recipes", "1", "Bowl", "actions", 8],
      ["top_programs", "1", "Base", "enrolled", 2],
      ["top_products", "1", "Marmita", "cart_adds", 3],
    ]);
    expect(sectionCsvRows("atalhos", parseShortcuts({ by_source: [{ source_key: "treinos", opens: 2, heroes: 1 }] }))).toEqual([
      ["source", "treinos", "treinos", "opens", 2],
      ["source", "treinos", "treinos", "heroes", 1],
    ]);
    const pro = sectionCsvRows("profissionais", parseProfessionals({ totals: { orders: 1, revenue_cents: 18000 } }));
    expect(pro).toContainEqual(["total", "total", "total", "revenue_cents_simulated", 18000]);
    expect(sectionCsvRows("colecionaveis", parseCollectibles({}))).toContainEqual(["period", "total", "total", "final_cents_simulated", 0]);
    expect(sectionCsvRows("conversao", parseConversion({}))).toContainEqual(["shop_funnel", "total", "total", "test_orders", 0]);
  });

  it("nome do arquivo com seção, período e data", () => {
    expect(csvFilename("atalhos", "7", new Date("2026-10-30T12:00:00Z"))).toBe("groscove-ultra-indicadores-atalhos-7d-2026-10-30.csv");
  });
});

describe("migração 0060 e rotas", () => {
  const sql = read("supabase/migrations/0060_indicators.sql");

  it("contador de atalhos: chave própria, sem FK, sem grant para anon/authenticated", () => {
    expect(sql).toMatch(/create table if not exists public\.shortcut_open_counters \(\s*id bigint generated always as identity primary key/);
    const table = sql.slice(sql.indexOf("create table if not exists public.shortcut_open_counters"), sql.indexOf("create index if not exists shortcut_open_counters_creator_idx"));
    expect(table).not.toMatch(/references/i);
    expect(sql).toContain("revoke all on table public.shortcut_open_counters from public, anon, authenticated;");
    expect(sql).toContain("revoke execute on function public.shortcut_open_bump(uuid, text) from public, anon, authenticated;");
  });

  it("leituras do admin conferem is_admin() e não são do visitante", () => {
    const fns = ["heroes", "shortcuts", "conversion", "professionals", "collectibles", "ranking"];
    for (const f of fns) {
      const start = sql.indexOf(`function public.admin_indicators_${f}(`);
      expect(start, f).toBeGreaterThan(0);
      expect(sql.slice(start, start + 400), f).toContain("if not public.is_admin() then raise exception 'forbidden'");
    }
    expect(sql).toContain("revoke execute on function public.%I(int) from public, anon");
    // nenhuma leitura devolve pessoa
    expect(sql).not.toMatch(/user_id', |'email'|client_label'/);
  });

  it("rota de abertura de atalho: 204 sempre, pula o navegador do E2E, só service role", () => {
    const route = read("src/app/api/shortcut-opens/route.ts");
    expect(route).toContain('get("uh-e2e")?.value === "1"');
    expect(route).toContain("createAdminClient().rpc(\"shortcut_open_bump\"");
    expect(route).toContain("status: 204");
    const exportRoute = read("src/app/admin/indicadores/export/route.ts");
    expect(exportRoute).toContain('hasRole("admin")');
  });
});
