import { beforeEach, describe, expect, it, vi } from "vitest";
import { chooseActingHero } from "@/app/admin/hero-actions";
import { ACTING_HERO_COOKIE, ACTING_HERO_HEADER, HERO_CARDS, HERO_SHORTCUTS, heroCardForPath, heroCardHref, heroPickerHref, isHeroCard } from "@/lib/acting-hero/constants";
import { getActingHero } from "@/lib/acting-hero/server";

// "Publicar como hero" (0045): para onde cada atalho leva, como o herói escolhido é lido (cookie só
// lembra; o banco confere com o mesmo cabeçalho que as actions mandam) e a escolha pelo seletor.

const HERO = "a3bb189e-8bf9-4888-9912-ace4e6543002";

type Res = { data: unknown; error: { message: string; code?: string } | null };

const state = vi.hoisted(() => ({
  user: { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" } as { id: string } | null,
  admin: true,
  cookie: undefined as string | undefined,
  set: [] as { name: string; value: string; options: Record<string, unknown> }[],
  clients: [] as (string | null)[],
  confirm: { data: null, error: null } as Res,
  probe: { data: null, error: null } as Res,
  choose: { data: null, error: null } as Res,
  hero: null as Record<string, unknown> | null,
  rpcs: [] as { fn: string; acting: string | null; args?: unknown }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "uh_acting_hero" && state.cookie !== undefined ? { value: state.cookie } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => void state.set.push({ name, value, options }),
  }),
}));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => state.user, hasRole: async (r: string) => r === "admin" && state.admin }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async (options: { actingHeroId?: string | null } = {}) => {
    const acting = options.actingHeroId ?? null;
    state.clients.push(acting);
    return {
      rpc: async (fn: string, args?: unknown) => {
        state.rpcs.push({ fn, acting, args });
        if (fn === "acting_hero_id") return acting ? state.confirm : state.probe;
        if (fn === "admin_act_as_hero") return state.choose;
        return { data: null, error: null };
      },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.hero, error: null }) }) }) }),
    };
  },
}));

beforeEach(() => {
  state.user = { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" };
  state.admin = true;
  state.cookie = HERO;
  state.set = [];
  state.clients = [];
  state.rpcs = [];
  state.confirm = { data: HERO, error: null };
  state.probe = { data: null, error: null };
  state.choose = { data: { id: HERO, slug: "heroi", name: "Herói" }, error: null };
  state.hero = { id: HERO, slug: "heroi", name: "Herói", avatar_url: null };
});

describe("atalhos", () => {
  it("6 destinos (Trocar hero volta à mesma tela), 3 atalhos no painel: Novo post, Novo conteúdo e Painel", () => {
    expect(HERO_CARDS).toEqual(["post", "newContent", "content", "recipes", "links", "dashboard"]);
    expect(HERO_SHORTCUTS).toEqual(["post", "newContent", "dashboard"]);
    expect(HERO_CARDS.map((c) => heroCardHref(c, HERO))).toEqual([
      "/creator/post/new",
      `/admin/content/new?creator=${HERO}`,
      `/admin/content?creator=${HERO}`,
      "/creator/recipes",
      "/creator/links",
      "/creator",
    ]);
    expect(isHeroCard("recipes")).toBe(true);
    expect(isHeroCard("admin")).toBe(false);
    expect(heroPickerHref("links")).toBe("/admin?heroi=links#publicar-como-hero");
  });

  it("Trocar hero volta ao mesmo atalho (a página de uma receita volta para a lista)", () => {
    expect(heroCardForPath("/creator/post/new")).toBe("post");
    expect(heroCardForPath(`/creator/recipes/${HERO}/edit`)).toBe("recipes");
    expect(heroCardForPath("/creator/links")).toBe("links");
    expect(heroCardForPath("/admin/content/new")).toBe("newContent");
    expect(heroCardForPath("/admin/content")).toBe("content");
    expect(heroCardForPath("/creator")).toBe("dashboard");
  });

  it("cabeçalho e cookie têm os nomes que o banco e o servidor esperam", () => {
    expect(ACTING_HERO_HEADER).toBe("x-acting-hero");
    expect(ACTING_HERO_COOKIE).toBe("uh_acting_hero");
  });
});

describe("getActingHero", () => {
  it("admin com cookie válido: confirma no banco com o cabeçalho do herói", async () => {
    expect(await getActingHero()).toEqual({ status: "ok", hero: state.hero });
    expect(state.rpcs).toEqual([{ fn: "acting_hero_id", acting: HERO, args: undefined }]);
  });

  it("não admin: nunca age por herói (nem consulta o banco)", async () => {
    state.admin = false;
    expect(await getActingHero()).toEqual({ status: "none" });
    expect(state.rpcs).toEqual([]);
  });

  it("banco não confirma (herói suspenso ou outro id): sem herói", async () => {
    state.confirm = { data: null, error: null };
    expect(await getActingHero()).toEqual({ status: "none" });
  });

  it("cookie que não é uuid: sem herói e sem cabeçalho", async () => {
    state.cookie = "../../etc";
    expect(await getActingHero()).toEqual({ status: "none" });
    expect(state.clients).toEqual([null]);
  });

  it("banco sem a 0045: indisponível", async () => {
    state.confirm = { data: null, error: { message: "Could not find the function", code: "PGRST202" } };
    expect(await getActingHero()).toEqual({ status: "unavailable" });
  });
});

describe("chooseActingHero", () => {
  it("admin escolhe: o banco confere e audita; o cookie lembra (httpOnly) e a tela abre o atalho", async () => {
    expect(await chooseActingHero(HERO, "recipes")).toEqual({ ok: true, href: "/creator/recipes" });
    expect(state.rpcs).toEqual([{ fn: "admin_act_as_hero", acting: null, args: { p_creator: HERO } }]);
    expect(state.set).toHaveLength(1);
    expect(state.set[0]).toMatchObject({ name: ACTING_HERO_COOKIE, value: HERO, options: { httpOnly: true, sameSite: "lax", path: "/" } });
  });

  it("não admin, herói inválido ou entrada estranha: nada é gravado", async () => {
    state.admin = false;
    expect(await chooseActingHero(HERO, "post")).toEqual({ ok: false, error: "forbidden" });
    state.admin = true;
    expect(await chooseActingHero("nao-e-uuid", "post")).toEqual({ ok: false, error: "invalid_input" });
    expect(await chooseActingHero(HERO, "outro")).toEqual({ ok: false, error: "invalid_input" });
    state.choose = { data: null, error: { message: "hero_unavailable" } };
    expect(await chooseActingHero(HERO, "post")).toEqual({ ok: false, error: "hero_unavailable" });
    state.choose = { data: null, error: { message: "not found", code: "PGRST202" } };
    expect(await chooseActingHero(HERO, "post")).toEqual({ ok: false, error: "acting_unavailable" });
    state.user = null;
    expect(await chooseActingHero(HERO, "post")).toEqual({ ok: false, error: "unauthenticated" });
    expect(state.set).toEqual([]);
  });
});
