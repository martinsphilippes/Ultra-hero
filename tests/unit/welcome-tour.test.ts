import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasSeenWelcome, isWelcomeArea, WELCOME_AREAS, WELCOME_STEPS, welcomeAreasFor, welcomeHref, welcomeMetaKey, welcomeStepCount, welcomeSuppressedOn } from "@/lib/welcome/areas";

// Card de boas-vindas por área (app, herói, marca, agência).

type Tree = Record<string, unknown>;
const LOCALES = ["pt-BR", "en", "es"] as const;
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(path.join(process.cwd(), "messages", l, "welcome.json"), "utf8")) as Tree]));
const get = (tree: Tree, key: string): unknown => key.split(".").reduce<unknown>((n, p) => (n && typeof n === "object" ? (n as Tree)[p] : undefined), tree);

describe("passos", () => {
  it("3 a 5 passos por área + o final igual para todos", () => {
    for (const area of WELCOME_AREAS) {
      expect(WELCOME_STEPS[area].length).toBeGreaterThanOrEqual(3);
      expect(WELCOME_STEPS[area].length).toBeLessThanOrEqual(5);
      expect(welcomeStepCount(area)).toBe(WELCOME_STEPS[area].length + 1);
    }
  });
  it.each(LOCALES)("%s tem título e frase de cada passo, o final e as Configurações", (locale) => {
    const tree = messages[locale] as Tree;
    for (const area of WELCOME_AREAS) {
      expect(typeof get(tree, `areas.${area}.title`)).toBe("string");
      expect(typeof get(tree, `settings.areas.${area}`)).toBe("string");
      for (const s of WELCOME_STEPS[area]) {
        expect(typeof get(tree, `areas.${area}.steps.${s.key}.title`), `${locale} ${area}.${s.key}`).toBe("string");
        expect(typeof get(tree, `areas.${area}.steps.${s.key}.body`), `${locale} ${area}.${s.key}`).toBe("string");
      }
    }
    for (const k of ["final.title", "final.body", "final.date", "next", "back", "skip", "start", "stepOf", "progress"]) expect(typeof get(tree, k), k).toBe("string");
  });
  it("pt-BR: último passo e botão pedidos pelo dono; sem demo", () => {
    const pt = messages["pt-BR"] as Tree;
    expect(get(pt, "final.title")).toBe("Mais novidades em breve.");
    expect(get(pt, "start")).toBe("Começar");
    for (const locale of LOCALES) expect(JSON.stringify(messages[locale])).not.toMatch(/demonstra|\bdemo\b|simulad/i);
  });
});

describe("visto, onde aparece e Como funciona", () => {
  it("chave por área no user_metadata", () => {
    expect(welcomeMetaKey("marca")).toBe("uh_welcome_seen_marca");
    expect(hasSeenWelcome({ uh_welcome_seen_marca: "2026-11-04T10:00:00Z" }, "marca")).toBe(true);
    expect(hasSeenWelcome({ uh_welcome_seen_marca: "2026-11-04T10:00:00Z" }, "heroi")).toBe(false);
    expect(hasSeenWelcome(null, "app")).toBe(false);
    expect(hasSeenWelcome({ uh_welcome_seen_app: "" }, "app")).toBe(false);
    expect(isWelcomeArea("admin")).toBe(false);
  });
  it("não abre sozinho nas telas da loja em Coming soon", () => {
    expect(welcomeSuppressedOn("/shop")).toBe(true);
    expect(welcomeSuppressedOn("/shop/colecionaveis")).toBe(true);
    expect(welcomeSuppressedOn("/cart")).toBe(true);
    expect(welcomeSuppressedOn("/checkout/x")).toBe(true);
    expect(welcomeSuppressedOn("/personalities")).toBe(false);
    expect(welcomeSuppressedOn("/shopping")).toBe(false);
  });
  it("Como funciona: o app para todos e cada portal para quem é dele (admin não ganha portais)", () => {
    expect(welcomeAreasFor({ roles: ["consumer"] })).toEqual(["app"]);
    expect(welcomeAreasFor({ roles: ["consumer", "creator"] })).toEqual(["app", "heroi"]);
    expect(welcomeAreasFor({ roles: ["consumer"], hasTalent: true })).toEqual(["app", "heroi"]);
    expect(welcomeAreasFor({ roles: ["consumer", "brand"] })).toEqual(["app", "marca"]);
    expect(welcomeAreasFor({ roles: ["consumer", "agency"] })).toEqual(["app", "agencia"]);
    expect(welcomeAreasFor({ roles: ["admin"] })).toEqual(["app"]);
    expect(welcomeHref("marca")).toBe("/marca?como-funciona=1");
    expect(welcomeHref("app")).toBe("/personalities?como-funciona=1");
  });
  it("montado nos layouts do app e dos portais, nunca no admin", () => {
    const root = process.cwd();
    const read = (f: string) => readFileSync(path.join(root, f), "utf8");
    expect(read("src/app/(app)/layout.tsx")).toContain('<WelcomeTourMount area="app" />');
    expect(read("src/app/heroi/layout.tsx")).toContain('<WelcomeTourMount area="heroi" />');
    expect(read("src/app/marca/layout.tsx")).toContain('<WelcomeTourMount area="marca" />');
    expect(read("src/app/agencia/layout.tsx")).toContain('<WelcomeTourMount area="agencia" />');
    expect(read("src/app/admin/layout.tsx")).not.toContain("WelcomeTour");
    // no Portal do Herói, o ramo do admin ("Publicar como hero") não monta o card
    const heroi = read("src/app/heroi/layout.tsx");
    expect(heroi.indexOf("WelcomeTourMount area")).toBeGreaterThan(heroi.indexOf('portal="creator"'));
  });
});
