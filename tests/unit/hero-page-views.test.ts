import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Visitas à página do herói (0061): validação da entrada da rota, rota (204 sempre, sem gravar do
// navegador do E2E, só service role), leitura do admin e migração.

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined) }) }));
const rpc = vi.fn(async () => ({ data: true, error: null }));
vi.mock("@/lib/supabase/admin", () => ({ hasAdminClient: () => true, createAdminClient: () => ({ rpc }) }));

import { POST } from "@/app/api/hero-page-views/route";
import { parseHeroes, parseHeroPageView, rankHeroesByPageViews, sectionCsvRows } from "@/lib/indicators";

const ID = "533f427b-b2a5-473b-9c6f-73e01501946a";
const post = (body: string) => POST(new Request("http://localhost/api/hero-page-views", { method: "POST", body }));
const read = (p: string) => readFileSync(path.resolve(__dirname, "../..", p), "utf8");

beforeEach(() => {
  rpc.mockClear();
  cookieJar.clear();
});

describe("parseHeroPageView", () => {
  it("aceita só { creatorId: uuid } e normaliza para minúsculas", () => {
    expect(parseHeroPageView({ creatorId: ID.toUpperCase() })).toEqual({ creatorId: ID });
    expect(parseHeroPageView({ creatorId: ID, userId: "x" })).toEqual({ creatorId: ID });
  });

  it("recusa o resto", () => {
    for (const input of [null, undefined, "x", 1, [], [ID], {}, { creatorId: "" }, { creatorId: "neymar" }, { creatorId: 123 }, { creatorId: `${ID}x` }, { creator_id: ID }]) {
      expect(parseHeroPageView(input), JSON.stringify(input)).toBeNull();
    }
  });
});

describe("POST /api/hero-page-views", () => {
  it("visita válida soma pelo service role e responde 204 sem corpo", async () => {
    const res = await post(JSON.stringify({ creatorId: ID }));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(rpc).toHaveBeenCalledWith("hero_page_view_bump", { p_creator: ID });
  });

  it("entrada inválida, JSON quebrado ou corpo grande: 204 e nada soma", async () => {
    for (const body of ["", "{", "null", JSON.stringify({ creatorId: "neymar" }), JSON.stringify({ creatorId: ID, pad: "x".repeat(300) })]) {
      const res = await post(body);
      expect(res.status, body.slice(0, 20)).toBe(204);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("navegador do E2E (cookie uh-e2e) não grava", async () => {
    cookieJar.set("uh-e2e", "1");
    expect((await post(JSON.stringify({ creatorId: ID }))).status).toBe(204);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("erro do banco (sem a 0061) não quebra: 204", async () => {
    rpc.mockRejectedValueOnce(new Error("function does not exist"));
    expect((await post(JSON.stringify({ creatorId: ID }))).status).toBe(204);
  });
});

describe("indicadores: visitas à página do herói", () => {
  const raw = (over: Record<string, unknown>) => ({ id: ID, slug: "anitta", name: "Anitta", status: "active", followers: 1, ...over });

  it("lê visitas por herói, série diária e data de início (sem a 0061: zero, vazia e nula)", () => {
    const d = parseHeroes({ rows: [raw({ page_views: "4" })], daily_page_views: [{ day: "2026-10-30", value: 4 }], page_views_since: "2026-10-30" });
    expect(d.rows[0].pageViews).toBe(4);
    expect(d.dailyPageViews).toEqual([{ day: "2026-10-30", value: 4 }]);
    expect(d.pageViewsSince).toBe("2026-10-30");
    const old = parseHeroes({ rows: [raw({})] });
    expect(old.rows[0].pageViews).toBe(0);
    expect(old.dailyPageViews).toEqual([]);
    expect(old.pageViewsSince).toBeNull();
  });

  it("ranking por visitas: só quem teve alguma; empate decide seguidores e depois nome", () => {
    const rows = parseHeroes({
      rows: [
        raw({ id: "a", name: "Bruna", page_views: 3, followers: 1 }),
        raw({ id: "b", name: "Carla", page_views: 3, followers: 9 }),
        raw({ id: "c", name: "Ana", page_views: 3, followers: 1 }),
        raw({ id: "d", name: "Duda", page_views: 10 }),
        raw({ id: "e", name: "Zero", page_views: 0 }),
      ],
    }).rows;
    expect(rankHeroesByPageViews(rows).map((h) => h.name)).toEqual(["Duda", "Carla", "Ana", "Bruna"]);
    expect(rankHeroesByPageViews(rows, 2)).toHaveLength(2);
  });

  it("CSV do ranking inclui os heróis por visitas", () => {
    const heroes = parseHeroes({ rows: [raw({ page_views: 5 })] });
    expect(sectionCsvRows("ranking", { ranking: { recipes: [], programs: [], products: [] }, heroes })).toContainEqual(["top_heroes_page_views", "1", "Anitta", "page_views", 5]);
  });
});

describe("migração 0061: contador", () => {
  const sql = read("supabase/migrations/0061_outbid_and_hero_views.sql");

  it("chave própria, sem FK, sem grant para anon/authenticated; soma só do service role", () => {
    expect(sql).toMatch(/create table if not exists public\.hero_page_view_counters \(\s*id bigint generated always as identity primary key/);
    const table = sql.slice(sql.indexOf("create table if not exists public.hero_page_view_counters"), sql.indexOf("create index if not exists hero_page_view_counters_creator_idx"));
    expect(table).not.toMatch(/references/i);
    expect(table).not.toMatch(/user_id|anon_id|\bip\b/);
    expect(sql).toContain("revoke all on table public.hero_page_view_counters from public, anon, authenticated;");
    expect(sql).toContain("revoke execute on function public.hero_page_view_bump(uuid) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.hero_page_view_bump(uuid) to service_role;");
  });

  it("leitura por herói continua só do admin", () => {
    const start = sql.indexOf("function public.admin_indicators_heroes(");
    expect(sql.slice(start, start + 400)).toContain("if not public.is_admin() then raise exception 'forbidden'");
    expect(sql).toContain("revoke execute on function public.admin_indicators_heroes(int) from public, anon;");
  });
});
