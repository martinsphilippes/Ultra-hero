import { describe, expect, it } from "vitest";
import { parseScreenState, screenSearch } from "@/lib/screen-cards";
import {
  TODAY_CARD_KEYS,
  dayTeaserParts,
  evolutionScreenKeys,
  evolutionTeaserParts,
  isTodayCardKey,
  joinTeaser,
  nightTeaserParts,
  parseTodayCardState,
  todayCardKeys,
  type TeaserPart,
} from "@/lib/routine/today-cards";

// Hoje em 3 cards (Seu dia, Sua noite, Evolução): quais aparecem, resumos e estado na URL.

const params = (query: string) => new URLSearchParams(query);

// formatação de teste parecida com a das mensagens pt-BR
function text(part: TeaserPart): string {
  switch (part.kind) {
    case "steps":
      return `${part.value.toLocaleString("pt-BR")} passos`;
    case "load":
      return `Carga ${part.value}`;
    case "workouts":
      return `${part.n} treino hoje`;
    case "stress":
      return `Estresse médio ${part.value}`;
    case "sleep":
      return `${Math.floor(part.minutes / 60)} h ${part.minutes % 60} min`;
    case "bodyBattery":
      return `Body Battery ${part.value}`;
    case "readiness":
      return `Índice da marca ${part.value}`;
    case "disposition":
      return part.band;
    case "streak":
      return `Sequência ${part.days} ${part.days === 1 ? "dia" : "dias"}`;
    case "programSteps":
      return `${part.done}/${part.total} passos dos programas`;
    case "completions":
      return `${part.n} conteúdos concluídos`;
  }
}

describe("cards do Hoje", () => {
  it("ordem fixa pedida: Seu dia, Sua noite, Evolução", () => {
    expect(TODAY_CARD_KEYS).toEqual(["dia", "noite", "evolucao"]);
    expect(todayCardKeys("metrics", { dia: 3, noite: 2, evolucao: 2 })).toEqual(["dia", "noite", "evolucao"]);
  });

  it("sem relógio (conectar/sincronizando) os cards do relógio continuam, com a tela do estado", () => {
    expect(todayCardKeys("connect", { dia: 1, noite: 1, evolucao: 2 })).toEqual(["dia", "noite", "evolucao"]);
    expect(todayCardKeys("syncing", { dia: 1, noite: 1, evolucao: 2 })).toEqual(["dia", "noite", "evolucao"]);
  });

  it("app das lojas com relógio simulado: só a Evolução, que aparece sempre", () => {
    expect(todayCardKeys("hidden", { dia: 3, noite: 2, evolucao: 2 })).toEqual(["evolucao"]);
    expect(todayCardKeys("metrics", { dia: 0, noite: 0 })).toEqual(["evolucao"]);
  });

  it("card sem telas some (Evolução não)", () => {
    expect(todayCardKeys("metrics", { dia: 2, noite: 0, evolucao: 2 })).toEqual(["dia", "evolucao"]);
  });

  it("Evolução: resumo → programas → comparação (só se houver)", () => {
    expect(evolutionScreenKeys(true)).toEqual(["resumo", "programas", "comparacao"]);
    expect(evolutionScreenKeys(false)).toEqual(["resumo", "programas"]);
  });
});

describe("resumos dos cards", () => {
  it("Seu dia: passos e carga", () => {
    const parts = dayTeaserParts({ steps: 2060.4, load: 38.6, workouts: 1, stressAvg: 30 });
    expect(parts).toEqual([
      { kind: "steps", value: 2060 },
      { kind: "load", value: 39 },
    ]);
    expect(joinTeaser(parts.map(text))).toBe("2.060 passos · Carga 39");
  });

  it("Seu dia sem passos nem carga: treinos e estresse; nada medido = vazio", () => {
    expect(dayTeaserParts({ steps: null, load: null, workouts: 1, stressAvg: 41.2 })).toEqual([
      { kind: "workouts", n: 1 },
      { kind: "stress", value: 41 },
    ]);
    expect(dayTeaserParts({ steps: null, load: null, workouts: 0, stressAvg: null })).toEqual([]);
    expect(joinTeaser([])).toBe("");
  });

  it("Sua noite: sono e Body Battery; na falta, índice da marca ou Disposição", () => {
    const parts = nightTeaserParts({ asleepMin: 415, bodyBattery: 53, readiness: null, disposition: null });
    expect(joinTeaser(parts.map(text))).toBe("6 h 55 min · Body Battery 53");
    expect(nightTeaserParts({ asleepMin: 415, bodyBattery: null, readiness: 82, disposition: "within" })).toEqual([
      { kind: "sleep", minutes: 415 },
      { kind: "readiness", value: 82 },
    ]);
    expect(nightTeaserParts({ asleepMin: null, bodyBattery: null, readiness: null, disposition: "within" })).toEqual([{ kind: "disposition", band: "within" }]);
  });

  it("Evolução: sequência e passos dos programas; sem programa, os conteúdos concluídos", () => {
    expect(joinTeaser(evolutionTeaserParts({ streak: 1, programDone: 0, programTotal: 3, completions: 5 }).map(text))).toBe("Sequência 1 dia · 0/3 passos dos programas");
    expect(evolutionTeaserParts({ streak: 4, programDone: 0, programTotal: 0, completions: 5 })).toEqual([
      { kind: "streak", days: 4 },
      { kind: "completions", n: 5 },
    ]);
    // feitos nunca passam do total; sequência negativa vira 0
    expect(evolutionTeaserParts({ streak: -2, programDone: 9, programTotal: 3, completions: 0 })).toEqual([
      { kind: "streak", days: 0 },
      { kind: "programSteps", done: 3, total: 3 },
    ]);
  });

  it("joinTeaser ignora partes vazias", () => {
    expect(joinTeaser(["a", null, " ", undefined, "b"])).toBe("a · b");
  });
});

describe("estado na URL (?secao=dia&tela=N)", () => {
  const counts = { dia: 3, noite: 2, evolucao: 3 };

  it("lê card e tela (1-based) e limita ao intervalo", () => {
    expect(parseTodayCardState(params("secao=dia&tela=2"), counts)).toEqual({ card: "dia", screen: 1 });
    expect(parseTodayCardState(params("secao=noite"), counts)).toEqual({ card: "noite", screen: 0 });
    expect(parseTodayCardState(params("secao=evolucao&tela=99"), counts)).toEqual({ card: "evolucao", screen: 2 });
    expect(parseTodayCardState(params("secao=evolucao&tela=0"), counts)).toEqual({ card: "evolucao", screen: 0 });
    expect(parseTodayCardState(params("secao=dia&tela=abc"), counts)).toEqual({ card: "dia", screen: 0 });
  });

  it("card desconhecido, ausente ou sem telas = fechado", () => {
    expect(parseTodayCardState(params(""), counts)).toBeNull();
    expect(parseTodayCardState(params("secao=conceito&tela=1"), counts)).toBeNull();
    expect(parseTodayCardState(params("secao=noite&tela=1"), { dia: 1, noite: 0, evolucao: 2 })).toBeNull();
    expect(isTodayCardKey("dia")).toBe(true);
    expect(isTodayCardKey("toString")).toBe(false);
  });

  it("genérico: só aceita cards presentes nas contagens (nem chaves herdadas do objeto)", () => {
    expect(parseScreenState(params("secao=toString&tela=1"), { dia: 2 })).toBeNull();
    expect(parseScreenState(params("secao=dia&tela=2"), { dia: 2 })).toEqual({ card: "dia", screen: 1 });
  });

  it("monta a query preservando outros parâmetros (ex.: ?exemplo=1)", () => {
    expect(screenSearch("?exemplo=1", { card: "noite", screen: 0 })).toBe("?exemplo=1&secao=noite&tela=1");
    expect(screenSearch("?exemplo=1&secao=dia&tela=3", null)).toBe("?exemplo=1");
    expect(screenSearch("?secao=dia&tela=3", null)).toBe("");
  });
});
