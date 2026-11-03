import { describe, expect, it } from "vitest";
import {
  BRL_MAX_INT_DIGITS,
  brlToCents,
  caretForSignificant,
  centsToBrl,
  finalizeBrl,
  maskBrl,
  significantBefore,
  typeBrl,
} from "@/lib/money/brl-input";
import { parseBrlToCents } from "@/lib/deals/schemas";
import { parseMoneyToCents } from "@/lib/collectibles/rules";
import { parsePriceToCents } from "@/components/editors/product/schema";
import { parsePriceInput as parseServicePrice } from "@/lib/professionals/rules";
import { parsePriceInput as parseBrandPrice } from "@/lib/brands/index";

/** Digita caractere por caractere no fim, como no celular. */
function typeAll(chars: string, start = ""): string {
  let text = start;
  for (const ch of chars) text = typeBrl(text, text + ch);
  return text;
}

describe("máscara BRL enquanto digita", () => {
  it("50000 digitado vira 50.000 (reais, não centavos)", () => {
    expect(typeAll("5")).toBe("5");
    expect(typeAll("5000")).toBe("5.000");
    expect(typeAll("50000")).toBe("50.000");
    expect(typeAll("1234567")).toBe("1.234.567");
  });

  it("vírgula abre até 2 casas", () => {
    expect(typeAll("1234,5")).toBe("1.234,5");
    expect(typeAll("1234,56")).toBe("1.234,56");
    expect(typeAll("1234,567")).toBe("1.234,56");
    expect(typeAll(",5")).toBe("0,5");
    expect(typeAll("12,")).toBe("12,");
  });

  it("ponto digitado no fim vira vírgula", () => {
    expect(typeAll("50.")).toBe("50,");
    expect(typeAll("50.5")).toBe("50,5");
  });

  it("apagar no fim reagrupa o milhar", () => {
    expect(typeBrl("12.345", "12.34")).toBe("1.234");
    expect(typeBrl("1.000", "1.00")).toBe("100");
    expect(typeBrl("5", "")).toBe("");
    expect(typeBrl("1.234,5", "1.234,")).toBe("1.234,");
  });

  it("sem negativos, sem letras, sem zeros à esquerda", () => {
    expect(typeAll("-50")).toBe("50");
    expect(typeAll("a5b0")).toBe("50");
    expect(typeAll("007")).toBe("7");
    expect(typeAll("0")).toBe("0");
  });

  it("recusa passar do limite de dígitos", () => {
    const full = typeAll("9".repeat(BRL_MAX_INT_DIGITS));
    expect(typeBrl(full, `${full}9`)).toBe(full);
  });
});

describe("colar e valores vindos de fora", () => {
  it.each([
    ["50000", "50.000"],
    ["50.000,00", "50.000,00"],
    ["R$ 50.000,00", "50.000,00"],
    ["R$50000", "50.000"],
    ["50000.5", "50.000,5"],
    ["29.90", "29,90"],
    ["1.234", "1.234"],
    ["1.234.567", "1.234.567"],
    ["1500,5", "1.500,5"],
    ["", ""],
    ["-10", "10"],
  ])("%s → %s", (raw, out) => {
    expect(maskBrl(raw)).toBe(out);
    expect(typeBrl("", raw, { pasted: true })).toBe(out);
  });
});

describe("blur completa os centavos", () => {
  it.each([
    ["50.000", "50.000,00"],
    ["1.234,5", "1.234,50"],
    ["1.234,", "1.234,00"],
    ["0,5", "0,50"],
    ["", ""],
  ])("%s → %s", (text, out) => expect(finalizeBrl(text)).toBe(out));
});

describe("centavos", () => {
  it("texto ↔ centavos", () => {
    expect(brlToCents("50.000,00")).toBe(5_000_000);
    expect(brlToCents("1.234,5")).toBe(123_450);
    expect(brlToCents("")).toBeNull();
    expect(centsToBrl(5_000_000)).toBe("50.000,00");
    expect(centsToBrl(5)).toBe("0,05");
    expect(centsToBrl(null)).toBe("");
  });
});

describe("cursor estável", () => {
  it("mantém os mesmos dígitos à esquerda", () => {
    // "1.234" com o cursor depois do "2" (pos 3); digita "9" → "1.2934" → "12.934": cursor depois do "9"
    const raw = "1.2934";
    const sig = significantBefore(raw, 4);
    const next = typeBrl("1.234", raw);
    expect(next).toBe("12.934");
    expect(caretForSignificant(next, sig)).toBe(4);
    expect(caretForSignificant("50.000", 0)).toBe(0);
  });
});

describe("os parsers do sistema aceitam o que o campo produz", () => {
  const samples: [string, number][] = [
    ["50.000", 5_000_000],
    ["50.000,00", 5_000_000],
    ["R$ 50.000,00", 5_000_000],
    ["1.234,5", 123_450],
    ["129,90", 12_990],
  ];
  it.each(samples)("%s", (text, cents) => {
    expect(parseBrlToCents(text)).toBe(cents);
    expect(parseMoneyToCents(text)).toBe(cents);
    expect(parsePriceToCents(text)).toBe(cents);
    expect(parseServicePrice(text)).toBe(cents);
    expect(parseBrandPrice(text)).toBe(cents);
  });
});
