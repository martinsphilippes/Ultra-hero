import { readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgramConcept } from "@/app/(app)/programs/[slug]/ProgramConcept";
import {
  conceptToForm,
  conceptView,
  emptyConceptForm,
  formToConcept,
  isMissingColumnError,
  parseConcept,
  pickConcept,
  programConceptSchema,
  rhythmChips,
  type ProgramConcept as Concept,
} from "@/lib/programs/concept";
import enConsume from "../../messages/en/consume.json";
import ptConsume from "../../messages/pt-BR/consume.json";

// Conceito do programa (0048): schema, regra de idioma, queda para a descrição, chips de ritmo,
// conversão do formulário do admin, renderização da seção e os textos gravados na migração.

const ROOT = path.resolve(__dirname, "../..");

const concept: Concept = {
  idea: "Eu sou um começo de dia que cabe em dez minutos, antes de abrir o celular.",
  for_who: "Para quem acorda já correndo.",
  not_for: "Não é um plano de treino.",
  outcomes: ["Um ritual de 10 minutos", "Uma respiração curta", "Uma noite preparada"],
  method: [
    { title: "Monte o ritual", text: "Comece pelo vídeo do ritual." },
    { title: "Desacelere", text: "Pratique a respiração 4-7-8." },
    { title: "Prepare a noite", text: "Use o guia da rotina noturna." },
  ],
  rhythm: { sessions_per_week: 7, minutes_per_day: 10, note: "Todas as manhãs." },
  needs: ["Um copo de água"],
  care: "Conteúdo educativo; não substitui orientação profissional.",
};

function render(children: ReactNode, locale: "pt-BR" | "en" = "pt-BR") {
  return renderToStaticMarkup(
    // eslint-disable-next-line react/no-children-prop
    createElement(NextIntlClientProvider, { locale, timeZone: "America/Sao_Paulo", messages: { consume: locale === "en" ? enConsume : ptConsume }, children }),
  );
}

describe("schema do conceito", () => {
  it("aceita o conceito completo e normaliza opcionais vazios para null", () => {
    expect(programConceptSchema.safeParse(concept).success).toBe(true);
    const parsed = programConceptSchema.parse({ ...concept, not_for: "  ", rhythm: { sessions_per_week: null, minutes_per_day: null, note: "" } });
    expect(parsed.not_for).toBeNull();
    expect(parsed.rhythm.note).toBeNull();
  });

  it("respeita os limites: até 3 conquistas, 3 a 4 etapas, até 8 itens, cuidados obrigatórios", () => {
    expect(programConceptSchema.safeParse({ ...concept, outcomes: [] }).success).toBe(false);
    expect(programConceptSchema.safeParse({ ...concept, outcomes: ["a1a", "b2b", "c3c", "d4d"] }).success).toBe(false);
    expect(programConceptSchema.safeParse({ ...concept, method: concept.method.slice(0, 2) }).success).toBe(false);
    expect(programConceptSchema.safeParse({ ...concept, method: [...concept.method, concept.method[0], concept.method[1]] }).success).toBe(false);
    expect(programConceptSchema.safeParse({ ...concept, needs: Array.from({ length: 9 }, (_, i) => `item ${i}`) }).success).toBe(false);
    expect(programConceptSchema.safeParse({ ...concept, care: "" }).success).toBe(false);
    expect(programConceptSchema.safeParse({ ...concept, rhythm: { ...concept.rhythm, minutes_per_day: 2.5 } }).success).toBe(false);
  });

  it("parseConcept: forma inesperada vira null (não derruba a página)", () => {
    expect(parseConcept(null)).toBeNull();
    expect(parseConcept(undefined)).toBeNull();
    expect(parseConcept({ idea: "x" })).toBeNull();
    expect(parseConcept("texto")).toBeNull();
    expect(parseConcept(concept)?.idea).toBe(concept.idea);
  });
});

describe("regra de idioma e queda para a descrição", () => {
  const localized = { ...concept, idea: "I am a ten-minute start to the day, before you open your phone." };

  it("tradução publicada vence; inválida ou ausente cai no conceito da versão", () => {
    expect(pickConcept(concept, localized)?.idea).toBe(localized.idea);
    expect(pickConcept(concept, null)?.idea).toBe(concept.idea);
    expect(pickConcept(concept, { idea: 1 })?.idea).toBe(concept.idea);
    expect(pickConcept(null, null)).toBeNull();
  });

  it("sem conceito usa a descrição; sem os dois, a seção some", () => {
    expect(conceptView(concept, "desc").kind).toBe("concept");
    expect(conceptView(null, "  Descrição antiga.  ")).toEqual({ kind: "description", description: "Descrição antiga." });
    expect(conceptView(null, "  ")).toEqual({ kind: "empty" });
    expect(conceptView(null, null)).toEqual({ kind: "empty" });
  });

  it("chips de ritmo: semanas da versão, sessões e minutos do conceito; nulos somem", () => {
    expect(rhythmChips(1, concept)).toEqual([
      { key: "weeks", n: 1 },
      { key: "sessions", n: 7 },
      { key: "minutes", n: 10 },
    ]);
    expect(rhythmChips(null, { ...concept, rhythm: { sessions_per_week: 3, minutes_per_day: null, note: null } })).toEqual([{ key: "sessions", n: 3 }]);
    expect(rhythmChips(4, null)).toEqual([{ key: "weeks", n: 4 }]);
  });

  it("erro de coluna inexistente (banco sem a 0048) é reconhecido", () => {
    expect(isMissingColumnError({ code: "42703", message: "column program_versions.concept does not exist" })).toBe(true);
    expect(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'concept' column" })).toBe(true);
    expect(isMissingColumnError({ code: "23514", message: "violates check constraint" })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });
});

describe("formulário do admin", () => {
  it("vazio por completo = remover o conceito (null)", () => {
    expect(formToConcept(emptyConceptForm())).toEqual({ ok: true, concept: null });
  });

  it("ida e volta preserva o conceito; linhas vazias de listas são ignoradas", () => {
    const form = conceptToForm(concept);
    form.outcomes.push("  ");
    form.needs.push("");
    form.method.push({ title: "", text: "" });
    const result = formToConcept(form);
    expect(result).toEqual({ ok: true, concept });
  });

  it("aponta os campos inválidos", () => {
    const form = conceptToForm(concept);
    form.idea = "curta";
    form.minutes_per_day = "abc";
    form.method = form.method.slice(0, 2);
    const result = formToConcept(form);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.paths).toEqual(expect.arrayContaining(["idea", "rhythm.minutes_per_day", "method"]));
  });
});

describe("seção Conceito do programa", () => {
  it("renderiza ideia, públicos, conquistas, etapas numeradas, ritmo, itens e cuidados", () => {
    const html = render(createElement(ProgramConcept, { concept, description: "Descrição antiga.", estimatedWeeks: 1 }));
    expect(html).toContain('data-concept="concept"');
    expect(html).toContain("Conceito do programa");
    expect(html).toContain(concept.idea);
    expect(html).toContain("Para quem é");
    expect(html).toContain("Não é para");
    expect(html).toContain("O que você vai conquistar");
    expect(html.match(/<li/g)?.length).toBeGreaterThanOrEqual(3 + 3 + 3 + 1);
    expect(html).toContain("Como funciona");
    expect(html).toContain("1 semana");
    expect(html).toContain("7× por semana");
    expect(html).toContain("~10 min por dia");
    expect(html).toContain("Um copo de água");
    expect(html).toContain("Cuidados");
    // a descrição antiga não duplica quando há conceito
    expect(html).not.toContain("Descrição antiga.");
  });

  it("esconde blocos vazios: sem 'Não é para', sem ritmo; sem itens mostra 'Nada além de você'", () => {
    const html = render(
      createElement(ProgramConcept, {
        concept: { ...concept, not_for: null, needs: [], rhythm: { sessions_per_week: null, minutes_per_day: null, note: null } },
        description: null,
        estimatedWeeks: null,
      }),
    );
    expect(html).not.toContain("Não é para");
    expect(html).not.toContain("Ritmo");
    expect(html).toContain("Nada além de você");
  });

  it("sem conceito mostra a descrição; sem nada não renderiza", () => {
    const html = render(createElement(ProgramConcept, { concept: null, description: "Descrição antiga.", estimatedWeeks: 2 }));
    expect(html).toContain('data-concept="description"');
    expect(html).toContain("Descrição antiga.");
    expect(render(createElement(ProgramConcept, { concept: null, description: null, estimatedWeeks: 2 }))).toBe("");
  });

  it("em inglês usa os rótulos traduzidos", () => {
    const html = render(createElement(ProgramConcept, { concept, description: null, estimatedWeeks: 2 }), "en");
    expect(html).toContain("Program concept");
    expect(html).toContain("2 weeks");
    expect(html).toContain("7× a week");
  });
});

describe("página e migração", () => {
  const page = readFileSync(path.join(ROOT, "src/app/(app)/programs/[slug]/page.tsx"), "utf8");
  const migration = readFileSync(path.join(ROOT, "supabase/migrations/0048_program_concept.sql"), "utf8");

  it("a seção fica logo depois do cabeçalho e antes dos conteúdos; o parágrafo antigo saiu", () => {
    const header = page.indexOf("</header>");
    const conceptAt = page.indexOf("<ProgramConcept");
    const items = page.indexOf('aria-labelledby="program-items"');
    expect(header).toBeGreaterThan(0);
    expect(conceptAt).toBeGreaterThan(header);
    expect(items).toBeGreaterThan(conceptAt);
    expect(page).not.toContain('aria-labelledby="program-about"');
    // conceito em consulta própria (banco sem a 0048 não quebra o select principal)
    expect(page).not.toMatch(/select\("[^"]*concept/);
  });

  it("migração: 24 conceitos pt-BR e 16 em en/es, todos válidos no schema do app", () => {
    const rows = Array.from(migration.matchAll(/\('([a-z0-9-]+)', '(pt-BR|en|es)', \$c\$(.*?)\$c\$::jsonb\)/g));
    const by = (l: string) => rows.filter((r) => r[2] === l);
    expect(by("pt-BR")).toHaveLength(24);
    expect(by("en")).toHaveLength(16);
    expect(by("es")).toHaveLength(16);
    for (const [, slug, , json] of rows) {
      const parsed = programConceptSchema.safeParse(JSON.parse(json));
      expect(parsed.success, slug).toBe(true);
    }
    const slugs = by("pt-BR").map((r) => r[1]);
    expect(slugs).toEqual(expect.arrayContaining(["manhas-com-intencao", "noites-que-descansam", "base-de-forca-4-semanas", "do-sofa-aos-5-km", "cozinha-de-base-preparos-essenciais", "marmitas-da-semana"]));
    for (const r of [...by("en"), ...by("es")]) expect(slugs).toContain(r[1]);
  });

  it("textos sem promessa de resultado e com o aviso educativo nos cuidados", () => {
    const rows = Array.from(migration.matchAll(/\('([a-z0-9-]+)', '(pt-BR|en|es)', \$c\$(.*?)\$c\$::jsonb\)/g));
    for (const [, slug, locale, json] of rows) {
      const c = JSON.parse(json) as Concept;
      expect(JSON.stringify(c), slug).not.toMatch(/\b\d+\s?(kg|quilos|kilos|pounds|lbs)\b/i);
      const marker = locale === "pt-BR" ? /educativo|demonstrativas/ : locale === "en" ? /Educational|Demo recipes/ : /educativo|demostrativas/;
      expect(c.care, `${slug} ${locale}`).toMatch(marker);
    }
  });

  it("migração: preenche só conceito nulo e a nova versão copia o conceito", () => {
    expect(migration).toMatch(/v\.concept is null/);
    expect(migration).toMatch(/l\.concept is null/);
    expect(migration).toMatch(/src\.concept/);
  });
});
