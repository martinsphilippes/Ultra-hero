import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractStepTiming, formatAmount, formatQuantity, formatQuantityWithNote, parseQuantity } from "@/lib/recipes/quantity";

// As 8 receitas do seed (0008) são a fonte; a tabela literal do backfill (0029) foi gerada por
// parseQuantity/extractStepTiming e é conferida aqui contra o seed e contra o próprio parser.
const root = path.resolve(__dirname, "../..");
const seedSql = readFileSync(path.join(root, "supabase/migrations/0008_seed.sql"), "utf8");
const backfillSql = readFileSync(path.join(root, "supabase/migrations/0029_recipes_backfill.sql"), "utf8");

type SeedRecipe = { key: string; ingredients: { item: string; qty: string }[]; steps: string[] };
const SEED: SeedRecipe[] = [
  ...seedSql.matchAll(/update public\.content_bodies set body = body \|\| '(\{.*?\})'::jsonb where content_id = public\.seed_uuid\('content:(g\d+)'\);/g),
].map((m) => ({ key: m[2], ...(JSON.parse(m[1]) as { ingredients: { item: string; qty: string }[]; steps: string[] }) }));

/** Lê as tuplas de um bloco "-- literal:<nome>:start … end" do SQL (aspas simples com '' de escape). */
function sqlTuples(sql: string, name: string): (string | number | boolean | null)[][] {
  const block = sql.split(`-- literal:${name}:start`)[1]?.split(`-- literal:${name}:end`)[0] ?? "";
  return block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("("))
    .map((l) => {
      const body = l.replace(/^\(/, "").replace(/\),?$/, "");
      const out: (string | number | boolean | null)[] = [];
      let i = 0;
      while (i < body.length) {
        if (body[i] === "'") {
          let s = "";
          i++;
          while (i < body.length) {
            if (body[i] === "'" && body[i + 1] === "'") {
              s += "'";
              i += 2;
            } else if (body[i] === "'") {
              i++;
              break;
            } else s += body[i++];
          }
          out.push(s);
        } else {
          const end = body.indexOf(",", i);
          const raw = body.slice(i, end < 0 ? undefined : end).trim();
          out.push(raw === "null" ? null : raw === "true" ? true : raw === "false" ? false : Number(raw));
          i = end < 0 ? body.length : end;
        }
        while (body[i] === "," || body[i] === " ") i++;
      }
      return out;
    });
}

describe("parseQuantity", () => {
  it("lê inteiros, decimais com vírgula, frações e frações mistas", () => {
    expect(parseQuantity("300 g")).toEqual({ kind: "numeric", quantity: 300, unit: "g", note: null });
    expect(parseQuantity("1,5 L")).toEqual({ kind: "numeric", quantity: 1.5, unit: "l", note: null });
    expect(parseQuantity("1.5 kg")).toEqual({ kind: "numeric", quantity: 1.5, unit: "kg", note: null });
    expect(parseQuantity("1/2 maço")).toEqual({ kind: "numeric", quantity: 0.5, unit: "bunch", note: null });
    expect(parseQuantity("2 1/2 xícaras")).toEqual({ kind: "numeric", quantity: 2.5, unit: "cup", note: null });
    expect(parseQuantity("½ xícara")).toEqual({ kind: "numeric", quantity: 0.5, unit: "cup", note: null });
    expect(parseQuantity("10")).toEqual({ kind: "numeric", quantity: 10, unit: null, note: null });
  });

  it("unidade com observação, tamanho como observação e sinônimos sem acento", () => {
    expect(parseQuantity("2 xícaras cheias")).toEqual({ kind: "numeric", quantity: 2, unit: "cup", note: "cheias" });
    expect(parseQuantity("1 média")).toEqual({ kind: "numeric", quantity: 1, unit: null, note: "média" });
    expect(parseQuantity("3 grandes")).toEqual({ kind: "numeric", quantity: 3, unit: null, note: "grandes" });
    expect(parseQuantity("1 xicara")).toEqual({ kind: "numeric", quantity: 1, unit: "cup", note: null });
    expect(parseQuantity("2 colheres (sopa)")).toEqual({ kind: "numeric", quantity: 2, unit: "tbsp", note: null });
  });

  it("o que não dá para separar fica como texto e não é recalculado", () => {
    expect(parseQuantity("3 colheres")).toEqual({ kind: "text", text: "3 colheres" });
    expect(parseQuantity("1 e 2 dentes")).toEqual({ kind: "text", text: "1 e 2 dentes" });
    expect(parseQuantity("1 de cada")).toEqual({ kind: "text", text: "1 de cada" });
    expect(parseQuantity("1 punhado")).toEqual({ kind: "text", text: "1 punhado" });
    expect(parseQuantity("meia xícara")).toEqual({ kind: "text", text: "meia xícara" });
    expect(parseQuantity("0 g")).toEqual({ kind: "text", text: "0 g" });
  });

  it("a gosto, vazio e espaços", () => {
    expect(parseQuantity("a gosto")).toEqual({ kind: "to_taste" });
    expect(parseQuantity("  A gosto ")).toEqual({ kind: "to_taste" });
    expect(parseQuantity("")).toEqual({ kind: "empty" });
    expect(parseQuantity(null)).toEqual({ kind: "empty" });
    expect(parseQuantity("  300   g ")).toEqual({ kind: "numeric", quantity: 300, unit: "g", note: null });
  });
});

describe("formatQuantity (pt-BR)", () => {
  it("plural a partir de 2; símbolos métricos não variam; fração fora do métrico", () => {
    expect(formatQuantity(1, "tbsp")).toBe("1 colher de sopa");
    expect(formatQuantity(2, "tbsp")).toBe("2 colheres de sopa");
    expect(formatQuantity(1.5, "cup")).toBe("1 1/2 xícara");
    expect(formatQuantity(2.5, "cup")).toBe("2 1/2 xícaras");
    expect(formatQuantity(0.5, "bunch")).toBe("1/2 maço");
    expect(formatQuantity(1.5, "l")).toBe("1,5 L");
    expect(formatQuantity(0.25, "kg")).toBe("0,25 kg");
    expect(formatQuantity(300, "g")).toBe("300 g");
    expect(formatQuantity(10, null)).toBe("10");
    expect(formatQuantity(1 / 3, "cup")).toBe("1/3 xícara");
    expect(formatAmount(1.2, "cup")).toBe("1,2");
  });

  it("observação entra depois da quantidade", () => {
    expect(formatQuantityWithNote(1, null, "média")).toBe("1 média");
    expect(formatQuantityWithNote(2, "cup", null)).toBe("2 xícaras");
  });
});

describe("extractStepTiming", () => {
  it("só usa ocorrência única e inequívoca", () => {
    expect(extractStepTiming("Asse a 200 °C por 25 minutos.")).toEqual({ duration_seconds: 1500, temperature_c: 200 });
    expect(extractStepTiming("Grelhe 5 minutos de cada lado.")).toEqual({ duration_seconds: null, temperature_c: null });
    expect(extractStepTiming("Cozinhe 10 minutos e descanse 5 minutos.")).toEqual({ duration_seconds: null, temperature_c: null });
    expect(extractStepTiming("Guarde por até 5 dias.")).toEqual({ duration_seconds: null, temperature_c: null });
    expect(extractStepTiming("Deixe fermentar por 2 horas.")).toEqual({ duration_seconds: 7200, temperature_c: null });
  });
});

describe("as 8 receitas do seed e a tabela literal do backfill (0029)", () => {
  const ingLiterals = sqlTuples(backfillSql, "ingredients");
  const stepLiterals = sqlTuples(backfillSql, "steps");
  const seedIngredients = SEED.flatMap((r) => r.ingredients.map((x, i) => ({ key: r.key, pos: i + 1, ...x })));
  const seedSteps = SEED.flatMap((r) => r.steps.map((text, i) => ({ key: r.key, pos: i + 1, text })));

  it("o seed tem 8 receitas, 41 ingredientes e 28 etapas", () => {
    expect(SEED.map((r) => r.key)).toEqual(["g1", "g2", "g3", "g4", "g5", "g6", "g8", "g9"]);
    expect(seedIngredients).toHaveLength(41);
    expect(seedSteps).toHaveLength(28);
  });

  it("41 linhas: 34 numéricas, 3 em texto e 4 a gosto", () => {
    const kinds = seedIngredients.map((x) => parseQuantity(x.qty).kind);
    expect(kinds.filter((k) => k === "numeric")).toHaveLength(34);
    expect(kinds.filter((k) => k === "text")).toHaveLength(3);
    expect(kinds.filter((k) => k === "to_taste")).toHaveLength(4);
  });

  it("formatado + observação = texto original nas 34 numéricas", () => {
    for (const x of seedIngredients) {
      const p = parseQuantity(x.qty);
      if (p.kind === "numeric") expect(formatQuantityWithNote(p.quantity, p.unit, p.note)).toBe(x.qty);
    }
  });

  it("a tabela literal tem exatamente as linhas do seed (receita, posição, item e texto) e os valores do parser", () => {
    expect(ingLiterals).toHaveLength(41);
    ingLiterals.forEach(([key, pos, item, qty, quantity, unit, quantityText, toTaste, note], i) => {
      const seed = seedIngredients[i];
      expect([key, pos, item, qty]).toEqual([seed.key, seed.pos, seed.item, seed.qty]);
      const p = parseQuantity(seed.qty);
      if (p.kind === "numeric") expect({ quantity, unit, quantityText, toTaste, note }).toEqual({ quantity: p.quantity, unit: p.unit, quantityText: null, toTaste: false, note: p.note });
      else if (p.kind === "to_taste") expect({ quantity, unit, quantityText, toTaste, note }).toEqual({ quantity: null, unit: null, quantityText: null, toTaste: true, note: null });
      else expect({ quantity, unit, quantityText, toTaste, note }).toEqual({ quantity: null, unit: null, quantityText: seed.qty, toTaste: false, note: null });
    });
  });

  it("etapas literais: mesmo texto do seed, duração e temperatura do extrator (11 com duração)", () => {
    expect(stepLiterals).toHaveLength(28);
    stepLiterals.forEach(([key, pos, text, duration, temp], i) => {
      const seed = seedSteps[i];
      expect([key, pos, text]).toEqual([seed.key, seed.pos, seed.text]);
      expect({ duration_seconds: duration, temperature_c: temp }).toEqual(extractStepTiming(seed.text));
    });
    expect(stepLiterals.filter((s) => s[3] !== null)).toHaveLength(11);
  });

  it("exemplos do desenho: g1 batata-doce 1 + média, g4 água 2,5 xícaras, g6 caldo 1,5 L, g1.1 25 min a 200 °C", () => {
    expect(parseQuantity("1 média")).toEqual({ kind: "numeric", quantity: 1, unit: null, note: "média" });
    expect(parseQuantity("2 1/2 xícaras")).toMatchObject({ quantity: 2.5, unit: "cup" });
    expect(parseQuantity("1,5 L")).toMatchObject({ quantity: 1.5, unit: "l" });
    const g1 = SEED.find((r) => r.key === "g1")!;
    expect(extractStepTiming(g1.steps[0])).toEqual({ duration_seconds: 1500, temperature_c: 200 });
  });
});
