import { describe, expect, it } from "vitest";
import { amountKind, applyFraction, convertAmount, sanitizeAmount } from "@/lib/recipes/ingredient-amount";

describe("quantidade do ingrediente: segue a unidade", () => {
  it("tipo por unidade", () => {
    expect(amountKind("kg")).toBe("decimal");
    expect(amountKind("g")).toBe("decimal");
    expect(amountKind("cup")).toBe("fraction");
    expect(amountKind("unit")).toBe("fraction");
    expect(amountKind("")).toBe("free");
  });
  it("peso/volume: só número com uma vírgula e 2 casas", () => {
    expect(sanitizeAmount("1.5kg", "kg")).toBe("1,5");
    expect(sanitizeAmount("200g", "g")).toBe("200");
    expect(sanitizeAmount("1/2", "kg")).toBe("12");
    expect(sanitizeAmount("0,125", "l")).toBe("0,12");
    expect(sanitizeAmount(",5", "ml")).toBe("0,5");
  });
  it("xícara, colher, unidade: inteiro, fração ou misto; sem letras", () => {
    expect(sanitizeAmount("1/2 xícara", "cup")).toBe("1/2");
    expect(sanitizeAmount("2  1/2", "tbsp")).toBe("2 1/2");
    expect(sanitizeAmount("1//2", "unit")).toBe("1/2");
    expect(sanitizeAmount("1,5", "cup")).toBe("1,5");
  });
  it("sem unidade: aceita texto livre como antes", () => {
    expect(sanitizeAmount("1 média", "")).toBe("1 média");
  });
  it("trocar a unidade converte o formato", () => {
    expect(convertAmount("0,5", "cup")).toBe("1/2");
    expect(convertAmount("1/2", "kg")).toBe("0,5");
    expect(convertAmount("2 1/2", "l")).toBe("2,5");
    expect(convertAmount("1/2", "cup")).toBe("1/2");
    expect(convertAmount("200", "g")).toBe("200");
    expect(convertAmount("1 média", "unit")).toBe("1");
    expect(convertAmount("abc", "")).toBe("abc");
  });
  it("atalho de fração mantém o inteiro e troca a fração", () => {
    expect(applyFraction("", "1/2")).toBe("1/2");
    expect(applyFraction("2", "1/2")).toBe("2 1/2");
    expect(applyFraction("2 1/4", "3/4")).toBe("2 3/4");
    expect(applyFraction("1/3", "1/2")).toBe("1/2");
    expect(applyFraction("0", "1/4")).toBe("1/4");
  });
});
