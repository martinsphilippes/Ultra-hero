import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HERO_PORTAL_ROOT, isHeroPortalLink, legacyHeroPortalTarget } from "@/lib/hero-portal/routes";
import { heroPortalSections } from "@/lib/hero-work/rules";
import { inboxKindEmails, inboxKindPushes, safeInboxLink } from "@/lib/inbox/kinds";

// 0097: o CREATOR é o próprio HERO. Para o usuário não existe mais "creator" (nem "creador"/"criador") nem o
// "escritório": um portal só, o Portal do Hero, em /heroi. Os endereços antigos redirecionam para sempre.

const LOCALES = ["pt-BR", "en", "es"] as const;
const ROOT = path.join(process.cwd(), "messages");

/** Todos os textos visíveis de um idioma (chave → texto), sem os nomes dos placeholders ({creator}, {count, plural…}). */
function visibleTexts(locale: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (value: unknown, key: string) => {
    if (typeof value === "string") out.push([key, value.replace(/\{\s*[A-Za-z0-9_]+\s*(?=[,}])/g, "{")]);
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, key ? `${key}.${k}` : k);
  };
  for (const file of readdirSync(path.join(ROOT, locale)).filter((f) => f.endsWith(".json"))) {
    walk(JSON.parse(readFileSync(path.join(ROOT, locale, file), "utf8")), file.replace(/\.json$/, ""));
  }
  const native = path.join(process.cwd(), "messages-native", `${locale}.json`);
  walk(JSON.parse(readFileSync(native, "utf8")), "native");
  return out;
}

// Exceção pedida pela Groscove (reunião de 06/11/2026): no cadastro, o cartão do Hero diz "Sou um Creator e quero
// trabalhar com marcas", porque quem chega ainda não sabe o que é um Hero. Só esta frase.
// 0141 (pedido de 11/11/2026, texto exato): "O acesso de Creators é exclusivo pelo aplicativo Ultra Hero. Abra o app para
// continuar." — a mesma frase no login, na mensagem do app, na tela de status e nos erros das ações do Hero.
const CREATOR_ALLOWED = new Set([
  "auth.choose.hero.text",
  "auth.errors.creatorAppOnly",
  "agency.errors.creator_app_only",
  "access.pending.errors.creatorAppOnly",
  "access.appOnly.message",
]);
// Onda Digital (0132, roteiro aprovado em 07/11/2026): a página repete os textos da apresentação da Groscove, que
// fala em "creators" (a frente Creators, "Mais de mil creators para campanhas particulares", "com creators como
// opcional"). Só os textos dessa página.
const CREATOR_ALLOWED_PREFIXES = ["ondaDigital."];

describe("nenhum texto visível fala em creator (0097)", () => {
  for (const locale of LOCALES) {
    it(`${locale}: sem creator/creador/criador nos textos (só nas chaves técnicas)`, () => {
      const found = visibleTexts(locale).filter(
        ([key, text]) => !CREATOR_ALLOWED.has(key) && !CREATOR_ALLOWED_PREFIXES.some((p) => key.startsWith(p)) && /creator|creador|criador/i.test(text),
      );
      expect(found).toEqual([]);
    });
    it(`${locale}: sem o "escritório" do creator (virou o Portal do Hero)`, () => {
      const pattern = locale === "pt-BR" ? /escrit[oó]rio/i : locale === "es" ? /\boficina\b/i : /\boffice\b/i;
      const found = visibleTexts(locale).filter(([key, text]) => pattern.test(text) && !key.startsWith("legal."));
      expect(found).toEqual([]);
    });
  }
  it("o portal tem o mesmo nome nos três idiomas", () => {
    const portal = (l: string) => JSON.parse(readFileSync(path.join(ROOT, l, "me.json"), "utf8")).profile.portals.creator;
    expect([portal("pt-BR"), portal("en"), portal("es")]).toEqual(["Portal do Hero", "Hero Portal", "Portal del Hero"]);
  });
});

describe("endereços antigos /creator/* → /heroi/* (308 no middleware)", () => {
  it("portal do Hero", () => {
    expect(legacyHeroPortalTarget("/creator")).toBe("/heroi");
    expect(legacyHeroPortalTarget("/creator/")).toBe("/heroi");
    expect(legacyHeroPortalTarget("/creator/post/new")).toBe("/heroi/post/novo");
    expect(legacyHeroPortalTarget("/creator/content")).toBe("/heroi/conteudos");
    expect(legacyHeroPortalTarget("/creator/content/new")).toBe("/heroi/conteudos/novo");
    expect(legacyHeroPortalTarget("/creator/content/abc/edit")).toBe("/heroi/conteudos/abc/editar");
    expect(legacyHeroPortalTarget("/creator/recipes")).toBe("/heroi/receitas");
    expect(legacyHeroPortalTarget("/creator/recipes/new")).toBe("/heroi/receitas/nova");
    expect(legacyHeroPortalTarget("/creator/recipes/r1/edit")).toBe("/heroi/receitas/r1/editar");
    expect(legacyHeroPortalTarget("/creator/recipes/r1/preview")).toBe("/heroi/receitas/r1/previa");
    expect(legacyHeroPortalTarget("/creator/recipes/r1/versions")).toBe("/heroi/receitas/r1/versoes");
    expect(legacyHeroPortalTarget("/creator/links")).toBe("/heroi/vinculos");
    expect(legacyHeroPortalTarget("/creator/profile")).toBe("/heroi/pagina");
    expect(legacyHeroPortalTarget("/creator/equipe")).toBe("/heroi/equipe");
    expect(legacyHeroPortalTarget("/creator/agenda")).toBe("/heroi/agenda");
    expect(legacyHeroPortalTarget("/creator/financeiro")).toBe("/heroi/financeiro");
  });
  it("escritório (avisos do sino, e-mails e push antigos)", () => {
    expect(legacyHeroPortalTarget("/creator/escritorio")).toBe("/heroi");
    expect(legacyHeroPortalTarget("/creator/escritorio/oportunidades")).toBe("/heroi/oportunidades");
    expect(legacyHeroPortalTarget("/creator/escritorio/oportunidades/d1")).toBe("/heroi/oportunidades/d1");
    expect(legacyHeroPortalTarget("/creator/escritorio/tarefas")).toBe("/heroi/tarefas");
    expect(legacyHeroPortalTarget("/creator/escritorio/agenda")).toBe("/heroi/agenda");
    expect(legacyHeroPortalTarget("/creator/escritorio/ganhos")).toBe("/heroi/financeiro");
    expect(legacyHeroPortalTarget("/creator/escritorio/notificacoes")).toBe("/heroi/avisos");
    expect(legacyHeroPortalTarget("/creator/escritorio/assinaturas/s1")).toBe("/heroi/assinaturas/s1");
    for (const p of ["disponibilidade", "media-kit", "portfolio", "documentos", "consentimento"]) {
      expect(legacyHeroPortalTarget(`/creator/escritorio/${p}`)).toBe(`/heroi/${p}`);
    }
  });
  it("listas \"creators\" da marca, do negócio e do admin", () => {
    expect(legacyHeroPortalTarget("/marca/creators")).toBe("/marca/herois");
    expect(legacyHeroPortalTarget("/marca/creators/comparar")).toBe("/marca/herois/comparar");
    expect(legacyHeroPortalTarget("/agencia/negocios/n1/creators")).toBe("/agencia/negocios/n1/herois");
    expect(legacyHeroPortalTarget("/admin/creators/c1")).toBe("/admin/herois/c1");
  });
  it("endereços novos e parecidos não redirecionam", () => {
    for (const p of ["/heroi", "/heroi/agenda", "/creators", "/creator-x", "/personalities/creator", "/agencia/herois", "/"]) {
      expect(legacyHeroPortalTarget(p)).toBeNull();
    }
  });
  it("o middleware usa a regra antes da sessão", () => {
    const middleware = readFileSync(path.join(process.cwd(), "src/middleware.ts"), "utf8");
    expect(middleware).toContain("legacyHeroPortalTarget");
    expect(middleware).toMatch(/NextResponse\.redirect\(target, 308\)/);
    expect(middleware).toContain('"/heroi"');
  });
});

describe("links do sino, e-mail e push", () => {
  it("o link gravado no banco (/creator/escritorio/...) vira o do Portal do Hero, com a query", () => {
    expect(safeInboxLink("/creator/escritorio/oportunidades/d1#conversa")).toBe("/heroi/oportunidades/d1#conversa");
    expect(safeInboxLink("/creator/escritorio/agenda?mes=2026-11")).toBe("/heroi/agenda?mes=2026-11");
    expect(safeInboxLink("/agencia/negocios/x")).toBe("/agencia/negocios/x");
    expect(safeInboxLink("//evil.example")).toBe("/");
  });
  it("as regras de push e e-mail valem para o link antigo e para o novo", () => {
    expect(isHeroPortalLink("/creator/escritorio/tarefas")).toBe(true);
    expect(isHeroPortalLink(`${HERO_PORTAL_ROOT}/tarefas`)).toBe(true);
    expect(isHeroPortalLink("/agencia")).toBe(false);
    expect(inboxKindPushes("opportunity_received", "/creator/escritorio/oportunidades/x")).toBe(inboxKindPushes("opportunity_received", "/heroi/oportunidades/x"));
    expect(inboxKindEmails("opportunity_received", "/creator/escritorio/oportunidades/x")).toBe(true);
    expect(inboxKindEmails("opportunity_received", "/heroi/oportunidades/x")).toBe(true);
  });
});

describe("agenda e financeiro unificados", () => {
  it("com agência: os da agência e, se houver, os próprios; sem agência: os próprios", () => {
    expect(heroPortalSections({ casting: true, hasHero: true, heroHasAgency: true, ownCount: 0 })).toEqual({ agency: true, own: false });
    expect(heroPortalSections({ casting: true, hasHero: true, heroHasAgency: true, ownCount: 2 })).toEqual({ agency: true, own: true });
    expect(heroPortalSections({ casting: false, hasHero: true, heroHasAgency: false, ownCount: 0 })).toEqual({ agency: false, own: true });
    expect(heroPortalSections({ casting: true, hasHero: false, heroHasAgency: false, ownCount: 0 })).toEqual({ agency: true, own: false });
    // Hero em uso que não é o do casting (ex.: membro da equipe de outro Hero): os próprios por inteiro
    expect(heroPortalSections({ casting: true, hasHero: true, heroHasAgency: false, ownCount: 0 })).toEqual({ agency: true, own: true });
  });
});
