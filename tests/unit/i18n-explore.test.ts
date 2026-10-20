import { describe, expect, it } from "vitest";
import { negotiateLocale } from "@/i18n/negotiate";
import { defaultLocale } from "@/i18n/config";
import {
  activeFilterCount,
  exploreHref,
  MAX_QUERY_LENGTH,
  parseExploreParams,
  secondaryFilterCount,
  type ExploreParams,
  type RawSearchParams,
} from "@/components/discover/explore/params";
import { rpcErrorCode } from "@/lib/supabase/helpers";

// Converte um href gerado por exploreHref de volta em searchParams "crus" (como o Next entrega).
function hrefToRaw(href: string): RawSearchParams {
  const url = new URL(href, "https://exemplo.test");
  const raw: RawSearchParams = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    raw[key] = all.length > 1 ? all : all[0];
  }
  return raw;
}

describe("negotiateLocale", () => {
  it("usa pt-BR como padrão quando o cabeçalho está ausente ou vazio", () => {
    expect(defaultLocale).toBe("pt-BR");
    expect(negotiateLocale(null)).toBe("pt-BR");
    expect(negotiateLocale(undefined)).toBe("pt-BR");
    expect(negotiateLocale("")).toBe("pt-BR");
    expect(negotiateLocale("   ")).toBe("pt-BR");
  });

  it("aceita correspondência exata, sem diferenciar maiúsculas/minúsculas", () => {
    expect(negotiateLocale("pt-BR")).toBe("pt-BR");
    expect(negotiateLocale("pt-br")).toBe("pt-BR");
    expect(negotiateLocale("en")).toBe("en");
    expect(negotiateLocale("ES")).toBe("es");
  });

  it("cai na região suportada: qualquer variante de português vira pt-BR", () => {
    expect(negotiateLocale("pt-PT")).toBe("pt-BR");
    expect(negotiateLocale("pt")).toBe("pt-BR");
    expect(negotiateLocale("pt-AO")).toBe("pt-BR");
  });

  it("cai no idioma base para variantes regionais de es/en", () => {
    expect(negotiateLocale("es-AR")).toBe("es");
    expect(negotiateLocale("es-419")).toBe("es");
    expect(negotiateLocale("en-GB")).toBe("en");
    expect(negotiateLocale("EN-us")).toBe("en");
  });

  it("respeita os pesos q, independentemente da ordem no cabeçalho", () => {
    expect(negotiateLocale("en;q=0.5, es;q=0.8")).toBe("es");
    expect(negotiateLocale("pt-PT;q=0.3, en-US;q=0.9")).toBe("en");
    expect(negotiateLocale("fr-FR, en;q=0.4, es;q=0.6")).toBe("es");
  });

  it("sem q explícito vale 1 e, em empate, vence a ordem do cabeçalho", () => {
    expect(negotiateLocale("es, en")).toBe("es");
    expect(negotiateLocale("en, es")).toBe("en");
    expect(negotiateLocale("en;q=0.9, es")).toBe("es");
    expect(negotiateLocale("es;q=0.7, en;q=0.7")).toBe("es");
  });

  it("tolera espaços em volta das tags e dos parâmetros", () => {
    expect(negotiateLocale("  fr ;q=0.9 ,  es-MX ; q=0.8 ")).toBe("es");
    // Tag sem região com espaço antes do ';' ainda casa com o locale.
    expect(negotiateLocale("fr ;q=0.9, en ;q=0.8, es;q=0.5")).toBe("en");
    // Espaço depois do ';' não pode fazer o q ser ignorado (o que viraria q=1).
    expect(negotiateLocale("es; q=0.2, en; q=0.6")).toBe("en");
  });

  it("entende o formato real dos navegadores, sem espaço após as vírgulas", () => {
    expect(negotiateLocale("fr-FR,fr;q=0.9,es;q=0.8,en;q=0.7")).toBe("es");
    expect(negotiateLocale("de-DE,de;q=0.9,en;q=0.8")).toBe("en");
    expect(negotiateLocale("en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7")).toBe("en");
  });

  it("o idioma base precisa coincidir inteiro, não só pelo prefixo", () => {
    // "esu" (iupique central) começa com "es", mas não é espanhol.
    expect(negotiateLocale("esu, en;q=0.1")).toBe("en");
    expect(negotiateLocale("esu")).toBe("pt-BR");
  });

  it("descarta q=0, q negativo e q inválido", () => {
    expect(negotiateLocale("en;q=0, es")).toBe("es");
    expect(negotiateLocale("en;q=0")).toBe("pt-BR");
    expect(negotiateLocale("en;q=-1, es;q=0.1")).toBe("es");
    expect(negotiateLocale("en;q=abc, es;q=0.2")).toBe("es");
  });

  it("pula idiomas não suportados até achar um suportado", () => {
    expect(negotiateLocale("fr-FR, de;q=0.9, en;q=0.1")).toBe("en");
    expect(negotiateLocale("zh-Hant-TW, ja, es")).toBe("es");
  });

  it("usa pt-BR quando nada é suportado ou o cabeçalho é lixo", () => {
    expect(negotiateLocale("fr-FR, de")).toBe("pt-BR");
    expect(negotiateLocale("*")).toBe("pt-BR");
    expect(negotiateLocale("*;q=0.5, fr")).toBe("pt-BR");
    expect(negotiateLocale(";;;,,,")).toBe("pt-BR");
    expect(negotiateLocale("@@@###")).toBe("pt-BR");
    expect(negotiateLocale("q=1")).toBe("pt-BR");
  });

  it("o curinga * não tira a vez de um idioma suportado de menor peso", () => {
    expect(negotiateLocale("*, es;q=0.5")).toBe("es");
  });
});

describe("parseExploreParams", () => {
  it("sem parâmetros usa a aba de conteúdos, busca vazia e nenhum filtro", () => {
    const params = parseExploreParams({});
    expect(params).toEqual({ tab: "conteudos", q: "" });
    expect(params.pillar).toBeUndefined();
    expect(params.type).toBeUndefined();
    expect(params.access).toBeUndefined();
    expect(params.difficulty).toBeUndefined();
  });

  it("aceita todos os valores válidos", () => {
    expect(
      parseExploreParams({ tab: "produtos", q: "frango", pillar: "nutrition", type: "recipe", access: "premium", difficulty: "advanced" }),
    ).toEqual({ tab: "produtos", q: "frango", pillar: "nutrition", type: "recipe", access: "premium", difficulty: "advanced" });
  });

  it("valores inválidos caem no padrão sem lançar erro", () => {
    let params: ExploreParams | undefined;
    expect(() => {
      params = parseExploreParams({ tab: "inexistente", pillar: "yoga", type: "podcast", access: "paid", difficulty: "expert" });
    }).not.toThrow();
    expect(params).toEqual({ tab: "conteudos", q: "" });
  });

  it("um filtro inválido não derruba os outros válidos", () => {
    expect(parseExploreParams({ tab: "listas", pillar: "TRAINING", type: "workout" })).toEqual({ tab: "listas", q: "", type: "workout" });
  });

  it("enums diferenciam maiúsculas e não aceitam string vazia", () => {
    expect(parseExploreParams({ tab: "Programas" }).tab).toBe("conteudos");
    expect(parseExploreParams({ tab: "" }).tab).toBe("conteudos");
    expect(parseExploreParams({ access: "" }).access).toBeUndefined();
  });

  it("parâmetro repetido usa o primeiro valor (em todas as chaves)", () => {
    expect(
      parseExploreParams({
        tab: ["programas", "produtos"],
        q: ["um", "dois"],
        pillar: ["routine", "training"],
        type: ["video", "recipe"],
        access: ["free", "premium"],
        difficulty: ["beginner", "advanced"],
      }),
    ).toEqual({ tab: "programas", q: "um", pillar: "routine", type: "video", access: "free", difficulty: "beginner" });
    expect(parseExploreParams({ tab: [], q: [] })).toEqual({ tab: "conteudos", q: "" });
  });

  it("apara espaços da busca", () => {
    expect(parseExploreParams({ q: "   bolo de cenoura  " }).q).toBe("bolo de cenoura");
    expect(parseExploreParams({ q: "     " }).q).toBe("");
  });

  it(`limita a busca a MAX_QUERY_LENGTH (${MAX_QUERY_LENGTH}) caracteres`, () => {
    expect(MAX_QUERY_LENGTH).toBe(100);
    const exact = "a".repeat(MAX_QUERY_LENGTH);
    expect(parseExploreParams({ q: exact }).q).toBe(exact);
    const long = "b".repeat(MAX_QUERY_LENGTH + 50);
    const parsed = parseExploreParams({ q: long }).q;
    expect(parsed).toHaveLength(MAX_QUERY_LENGTH);
    expect(parsed).toBe("b".repeat(MAX_QUERY_LENGTH));
  });

  it("apara antes de cortar: espaços iniciais não consomem o limite", () => {
    const parsed = parseExploreParams({ q: " ".repeat(20) + "c".repeat(MAX_QUERY_LENGTH) }).q;
    expect(parsed).toBe("c".repeat(MAX_QUERY_LENGTH));
  });
});

describe("exploreHref", () => {
  it("sem parâmetros (ou só padrões) gera /explore limpo", () => {
    expect(exploreHref({})).toBe("/explore");
    expect(exploreHref({ tab: "conteudos", q: "" })).toBe("/explore");
    expect(exploreHref(parseExploreParams({}))).toBe("/explore");
  });

  it("omite a aba padrão mas inclui as demais", () => {
    expect(exploreHref({ tab: "conteudos", q: "x" })).toBe("/explore?q=x");
    expect(exploreHref({ tab: "programas" })).toBe("/explore?tab=programas");
  });

  it("gera as chaves em ordem estável e codifica a busca", () => {
    const href = exploreHref({ difficulty: "beginner", access: "free", type: "video", pillar: "routine", q: "frango & batata", tab: "produtos" });
    expect(href).toBe("/explore?tab=produtos&q=frango+%26+batata&pillar=routine&type=video&access=free&difficulty=beginner");
  });

  it("override null remove a chave", () => {
    const base: ExploreParams = { tab: "produtos", q: "aveia", pillar: "training", type: "video" };
    expect(exploreHref(base, { pillar: null })).toBe("/explore?tab=produtos&q=aveia&type=video");
    expect(exploreHref(base, { q: null, pillar: null, type: null, access: null, difficulty: null })).toBe("/explore?tab=produtos");
    expect(exploreHref(base, { tab: null })).toBe("/explore?q=aveia&pillar=training&type=video");
  });

  it("override com valor substitui; undefined mantém o valor atual", () => {
    const base: ExploreParams = { tab: "conteudos", q: "", pillar: "training" };
    expect(exploreHref(base, { pillar: "nutrition" })).toBe("/explore?pillar=nutrition");
    expect(exploreHref(base, { pillar: undefined })).toBe("/explore?pillar=training");
    expect(exploreHref(base, { tab: "programas" })).toBe("/explore?tab=programas&pillar=training");
  });

  it("override para a aba padrão some da URL", () => {
    expect(exploreHref({ tab: "listas", q: "x" }, { tab: "conteudos" })).toBe("/explore?q=x");
  });

  it("não altera o objeto de parâmetros recebido", () => {
    const base: ExploreParams = { tab: "produtos", q: "x", pillar: "routine" };
    const copy = { ...base };
    exploreHref(base, { pillar: null, q: "y" });
    expect(base).toEqual(copy);
  });

  it("ida e volta: parseExploreParams(exploreHref(p)) devolve os mesmos parâmetros", () => {
    const cases: ExploreParams[] = [
      { tab: "conteudos", q: "" },
      { tab: "programas", q: "força" },
      { tab: "produtos", q: "pão & café = 100%?", pillar: "gastronomy", type: "recipe", access: "premium", difficulty: "intermediate" },
      { tab: "listas", q: "", access: "free" },
      { tab: "conteudos", q: "á é í ó ú ç ã õ #tag /barra", difficulty: "beginner" },
    ];
    for (const params of cases) {
      expect(parseExploreParams(hrefToRaw(exploreHref(params)))).toEqual(params);
    }
  });

  it("ida e volta a partir da URL: URL normalizada é estável", () => {
    const raw = { tab: "programas", q: "  treino  ", pillar: "invalido", type: "workout" };
    const href = exploreHref(parseExploreParams(raw));
    expect(href).toBe("/explore?tab=programas&q=treino&type=workout");
    expect(exploreHref(parseExploreParams(hrefToRaw(href)))).toBe(href);
  });
});

describe("activeFilterCount / secondaryFilterCount", () => {
  it("zero sem filtros; busca e aba não contam como filtro", () => {
    const params: ExploreParams = { tab: "produtos", q: "aveia" };
    expect(activeFilterCount(params)).toBe(0);
    expect(secondaryFilterCount(params)).toBe(0);
  });

  it("pilar conta como filtro ativo, mas não como secundário", () => {
    const params: ExploreParams = { tab: "conteudos", q: "", pillar: "routine" };
    expect(activeFilterCount(params)).toBe(1);
    expect(secondaryFilterCount(params)).toBe(0);
  });

  it("tipo, acesso e dificuldade contam nos dois", () => {
    const params: ExploreParams = { tab: "conteudos", q: "", type: "guide", access: "free", difficulty: "advanced" };
    expect(activeFilterCount(params)).toBe(3);
    expect(secondaryFilterCount(params)).toBe(3);
  });

  it("todos os filtros: 4 ativos, 3 secundários", () => {
    const params: ExploreParams = { tab: "conteudos", q: "", pillar: "nutrition", type: "article", access: "premium", difficulty: "beginner" };
    expect(activeFilterCount(params)).toBe(4);
    expect(secondaryFilterCount(params)).toBe(3);
  });

  it("filtros inválidos descartados pelo parser não contam", () => {
    const params = parseExploreParams({ pillar: "yoga", type: "podcast", access: "free" });
    expect(activeFilterCount(params)).toBe(1);
    expect(secondaryFilterCount(params)).toBe(1);
  });
});

describe("rpcErrorCode", () => {
  it("devolve 'unknown' para mensagem ausente ou vazia", () => {
    expect(rpcErrorCode(undefined)).toBe("unknown");
    expect(rpcErrorCode(null)).toBe("unknown");
    expect(rpcErrorCode("")).toBe("unknown");
  });

  it("mensagem só com o código volta inteira", () => {
    expect(rpcErrorCode("forbidden")).toBe("forbidden");
    expect(rpcErrorCode("cart_empty")).toBe("cart_empty");
  });

  it("extrai o código de 'codigo: detalhe' (RAISE EXCEPTION com %)", () => {
    expect(rpcErrorCode("protected_column: status")).toBe("protected_column");
    expect(rpcErrorCode("cannot_publish_missing: title, cover")).toBe("cannot_publish_missing");
    expect(rpcErrorCode('cart_changed: [{"product_id":"abc","price":10}]')).toBe("cart_changed");
  });

  it("detalhe com novos dois-pontos não confunde a extração", () => {
    expect(rpcErrorCode("invalid_transition: draft -> published by admin:42")).toBe("invalid_transition");
    expect(rpcErrorCode("module_dependency_missing: shop requires checkout: on")).toBe("module_dependency_missing");
  });

  it("separa o código também sem espaço depois dos dois-pontos", () => {
    expect(rpcErrorCode("protected_column:status")).toBe("protected_column");
    expect(rpcErrorCode("cart_changed:[]")).toBe("cart_changed");
  });

  it("apara espaços em volta do código", () => {
    expect(rpcErrorCode("  rate_limited  ")).toBe("rate_limited");
    expect(rpcErrorCode("  rate_limited  : tente depois")).toBe("rate_limited");
  });

  it("mensagem começando com dois-pontos dá código vazio (chamadores caem em 'generic')", () => {
    expect(rpcErrorCode(": sem código")).toBe("");
    expect(rpcErrorCode(": sem código") || "generic").toBe("generic");
  });
});
