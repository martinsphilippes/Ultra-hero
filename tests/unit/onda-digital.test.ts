import { describe, expect, it } from "vitest";
import { agencyNavKeys, brandNavKeys } from "@/lib/agency/roles";
import { formatCompact, formatMetric, ondaStepIndex, orderCasesForCategory, whatsappHref } from "@/lib/onda-digital/format";

describe("Onda Digital (0132)", () => {
  it("números no formato da apresentação", () => {
    expect(formatCompact(26_000_000, "pt-BR")).toBe("26M");
    expect(formatCompact(9_500_000, "pt-BR")).toBe("9,5M");
    expect(formatCompact(9_500_000, "en")).toBe("9.5M");
    expect(formatCompact(892_000, "pt-BR")).toBe("892K");
    expect(formatCompact(85_000, "pt-BR")).toBe("85K");
    expect(formatMetric({ k: "reach", v: 55_900_000 }, "pt-BR")).toBe("55,9M");
    expect(formatMetric({ k: "impacts", v: 35_000_000, plus: true }, "pt-BR")).toBe("+35M");
    expect(formatMetric({ k: "feed_reach", v: 13.67 }, "pt-BR")).toBe("13,67%");
  });
  it("a marca vê primeiro os cases da área dela, sem perder a ordem do resto", () => {
    const cases = [
      { id: "a", category: "entretenimento" },
      { id: "b", category: "tecnologia" },
      { id: "c", category: "gastronomia" },
      { id: "d", category: "tecnologia" },
    ];
    expect(orderCasesForCategory(cases, "tecnologia").map((c) => c.id)).toEqual(["b", "d", "a", "c"]);
    expect(orderCasesForCategory(cases, null).map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("WhatsApp da Groscove com a mensagem pronta", () => {
    expect(whatsappHref("Oi, Groscove! Sou da Natura")).toBe("https://wa.me/5511944971429?text=Oi%2C%20Groscove!%20Sou%20da%20Natura");
  });
  it("andamento: Recebido → Em conversa → Proposta → Na onda!; Encerrado fica fora da linha", () => {
    expect(ondaStepIndex("received")).toBe(0);
    expect(ondaStepIndex("live")).toBe(3);
    expect(ondaStepIndex("closed")).toBe(-1);
  });
  it("menu: a marca tem a Onda Digital logo depois do Início; na agência, só a Groscove (e o admin geral)", () => {
    expect(brandNavKeys()[1]).toBe("ondaDigital");
    expect(agencyNavKeys("manager", false)).not.toContain("ondaDigital");
    expect(agencyNavKeys("staff", false, { groscove: true })).toContain("ondaDigital");
    expect(agencyNavKeys(null, true)).toContain("ondaDigital");
  });
});

describe("Onda Digital: editor da Groscove (0134)", () => {
  it("entende os seguidores como a Groscove escreve", async () => {
    const { parseCompactNumber, parsePercent } = await import("@/lib/onda-digital/format");
    expect(parseCompactNumber("26M")).toBe(26_000_000);
    expect(parseCompactNumber("9,5M")).toBe(9_500_000);
    expect(parseCompactNumber("9.5M")).toBe(9_500_000);
    expect(parseCompactNumber("26 milhões")).toBe(26_000_000);
    expect(parseCompactNumber("1,3 mi")).toBe(1_300_000);
    expect(parseCompactNumber("892K")).toBe(892_000);
    expect(parseCompactNumber("892 mil")).toBe(892_000);
    expect(parseCompactNumber("1.300.000")).toBe(1_300_000);
    expect(parseCompactNumber("1300000")).toBe(1_300_000);
    expect(parseCompactNumber("+35M")).toBe(35_000_000);
    expect(parseCompactNumber("abc")).toBeNull();
    expect(parseCompactNumber("")).toBeNull();
    expect(parsePercent("13,67")).toBe(13.67);
    expect(parsePercent("13,67%")).toBe(13.67);
    expect(parsePercent("150")).toBeNull();
  });
});
