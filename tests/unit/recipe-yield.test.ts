import { describe, expect, it } from "vitest";
import { composeYield, convertYieldAmount, parseYield, sanitizeYieldAmount, type YieldLabel } from "@/lib/recipes/yield";

const PT: Record<string, [string, string]> = {
  unit: ["unidade", "unidades"],
  kg: ["kg", "kg"],
  g: ["g", "g"],
  l: ["L", "L"],
  ml: ["ml", "ml"],
  pan: ["forma", "formas"],
  tray: ["assadeira", "assadeiras"],
  slice: ["fatia", "fatias"],
  piece: ["pedaço", "pedaços"],
  jar: ["pote", "potes"],
};
const label: YieldLabel = (u, n) => PT[u][n === 1 ? 0 : 1];

describe("rendimento: o que a caixa aceita segue o tipo", () => {
  it("contagens: só inteiros, até 3 dígitos, sem zero à esquerda", () => {
    expect(sanitizeYieldAmount("12a", "unit")).toBe("12");
    expect(sanitizeYieldAmount("1,5", "pan")).toBe("15");
    expect(sanitizeYieldAmount("01234", "slice")).toBe("123");
  });
  it("g e ml: inteiros até 5 dígitos", () => {
    expect(sanitizeYieldAmount("750,5", "g")).toBe("7505");
    expect(sanitizeYieldAmount("1234567", "ml")).toBe("12345");
  });
  it("kg e L: uma vírgula e até 2 casas; ponto vira vírgula em pt", () => {
    expect(sanitizeYieldAmount("1.5", "kg")).toBe("1,5");
    expect(sanitizeYieldAmount("1,555", "l")).toBe("1,55");
    expect(sanitizeYieldAmount(",5", "kg")).toBe("0,5");
    expect(sanitizeYieldAmount("1,2,3", "kg")).toBe("1,23");
    expect(sanitizeYieldAmount("2.5", "kg", ".")).toBe("2.5");
  });
});

describe("rendimento: troca de tipo", () => {
  it("decimal para inteiro arredonda; inteiro para decimal mantém", () => {
    expect(convertYieldAmount("1,5", "pan")).toBe("2");
    expect(convertYieldAmount("0,4", "unit")).toBe("0");
    expect(convertYieldAmount("12", "kg")).toBe("12");
    expect(convertYieldAmount("", "g")).toBe("");
  });
});

describe("rendimento: texto salvo", () => {
  it("monta com singular/plural e número no formato do idioma", () => {
    expect(composeYield({ unit: "unit", amount: "12", other: "" }, label, "pt-BR")).toBe("12 unidades");
    expect(composeYield({ unit: "pan", amount: "1", other: "" }, label, "pt-BR")).toBe("1 forma");
    expect(composeYield({ unit: "kg", amount: "1,5", other: "" }, label, "pt-BR")).toBe("1,5 kg");
    expect(composeYield({ unit: "kg", amount: "1.5", other: "" }, label, "en")).toBe("1.5 kg");
    expect(composeYield({ unit: "g", amount: "1500", other: "" }, label, "pt-BR")).toBe("1500 g");
  });
  it("sem número, zero ou Outro vazio → vazio (campo opcional)", () => {
    expect(composeYield({ unit: "kg", amount: "", other: "" }, label, "pt-BR")).toBe("");
    expect(composeYield({ unit: "unit", amount: "0", other: "" }, label, "pt-BR")).toBe("");
    expect(composeYield({ unit: "other", amount: "", other: "  " }, label, "pt-BR")).toBe("");
    expect(composeYield({ unit: "other", amount: "", other: "1 travessa média" }, label, "pt-BR")).toBe("1 travessa média");
  });
  it("lê de volta o que montou (ida e volta)", () => {
    for (const [unit, amount] of [["unit", "12"], ["pan", "1"], ["kg", "1,5"], ["ml", "750"], ["jar", "3"]] as const) {
      const text = composeYield({ unit, amount, other: "" }, label, "pt-BR");
      expect(parseYield(text, label)).toEqual({ unit, amount, other: "" });
    }
  });
  it("texto antigo fora do formato abre como Outro, sem perder nada", () => {
    expect(parseYield("1 forma de 20 cm", label)).toEqual({ unit: "other", amount: "", other: "1 forma de 20 cm" });
    expect(parseYield("1,5 formas", label)).toEqual({ unit: "other", amount: "", other: "1,5 formas" });
    expect(parseYield("12 Unidades", label)).toEqual({ unit: "unit", amount: "12", other: "" });
    expect(parseYield(null, label)).toEqual({ unit: "unit", amount: "", other: "" });
  });
});
