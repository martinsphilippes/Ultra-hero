import { describe, expect, it } from "vitest";
import { brlToCents, editBrlFixed } from "@/lib/money/brl-input";

/** Simula o campo: texto + cursor; `type` insere no cursor, `back` apaga antes do cursor. */
function field(start = "") {
  let text = start;
  let caret = start.indexOf(",") >= 0 ? start.indexOf(",") : start.length;
  const apply = (raw: string, pos: number) => {
    const r = editBrlFixed(text, raw, pos);
    text = r.text;
    caret = r.caret;
  };
  return {
    type(chars: string) {
      for (const ch of chars) apply(text.slice(0, caret) + ch + text.slice(caret), caret + 1);
      return this;
    },
    back(n = 1) {
      for (let k = 0; k < n; k++) if (caret > 0) apply(text.slice(0, caret - 1) + text.slice(caret), caret - 1);
      return this;
    },
    at(pos: number) {
      caret = pos;
      return this;
    },
    get text() {
      return text;
    },
    get caret() {
      return caret;
    },
  };
}

describe("campo de reais sempre com ,00", () => {
  it("digitar reais mostra ,00 o tempo todo (50000 = cinquenta mil)", () => {
    expect(field().type("5").text).toBe("5,00");
    expect(field().type("50000").text).toBe("50.000,00");
    expect(brlToCents(field().type("50000").text)).toBe(5_000_000);
  });

  it("apagar o 1 e colocar o 3", () => {
    const f = field().type("1");
    expect(f.text).toBe("1,00");
    f.back();
    expect(f.text).toBe("");
    f.type("3");
    expect(f.text).toBe("3,00");
  });

  it("com o cursor no fim (depois do ,00), apagar tira o dígito dos reais e digitar entra nos reais", () => {
    const f = field("1.500,00").at(8);
    f.back();
    expect(f.text).toBe("150,00");
    f.at(f.text.length).type("7");
    expect(f.text).toBe("1.507,00");
  });

  it("vírgula pula para os centavos e cada dígito ocupa uma casa", () => {
    const f = field().type("12,5");
    expect(f.text).toBe("12,50");
    f.type("9");
    expect(f.text).toBe("12,59");
    expect(brlToCents(f.text)).toBe(1259);
  });

  it("apagar o ponto de milhar apaga o dígito antes dele", () => {
    const f = field("1.234,00").at(2);
    f.back();
    expect(f.text).toBe("234,00");
  });

  it("colar ou selecionar tudo e digitar lê o texto inteiro em reais", () => {
    expect(editBrlFixed("1.234,00", "R$ 2.500,5", 10, { pasted: true }).text).toBe("2.500,50");
    expect(editBrlFixed("1.234,00", "8", 1).text).toBe("8,00");
    expect(editBrlFixed("", "1500", 4).text).toBe("1.500,00");
  });

  it("letras são ignoradas", () => {
    expect(field("10,00").type("a").text).toBe("10,00");
  });
});
