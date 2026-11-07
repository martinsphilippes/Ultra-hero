import { describe, expect, it } from "vitest";
import { CONTENT_LEVELS, isContentLevel } from "@/lib/content-level/levels";
import { QUESTION_ORDER, QUESTIONS, isPersonalityType, scorePersonality } from "@/lib/personality/test";
import { CHIME_NOTES } from "@/lib/sound/chime";

// Reunião Groscove (06/11/2026), lotes D e E: nível do conteúdo, teste de personalidade e som de aviso.
describe("teste de personalidade", () => {
  it("32 frases, 8 por eixo, intercaladas sem repetir", () => {
    expect(QUESTIONS).toHaveLength(32);
    expect(new Set(QUESTION_ORDER).size).toBe(32);
    expect(QUESTION_ORDER.slice(0, 4).map((id) => QUESTIONS.find((q) => q.id === id)?.axis)).toEqual(["EI", "SN", "TF", "JP"]);
  });
  it("concordar com as frases de uma letra leva a ela; tudo neutro dá 50% e a primeira letra", () => {
    const all = (pick: (id: string) => number) => Object.fromEntries(QUESTIONS.map((q) => [q.id, pick(q.id)]));
    const intj = scorePersonality(all((id) => (["i", "n", "t", "j"].includes(id[0]!) ? 5 : 1)));
    expect(intj.type).toBe("INTJ");
    expect(intj.scores.EI).toBe(0);
    const esfp = scorePersonality(all((id) => (["e", "s", "f", "p"].includes(id[0]!) ? 5 : 1)));
    expect(esfp.type).toBe("ESFP");
    const neutral = scorePersonality(all(() => 3));
    expect(neutral.type).toBe("ESTJ");
    expect(neutral.scores).toEqual({ EI: 50, SN: 50, TF: 50, JP: 50 });
    expect(isPersonalityType(intj.type)).toBe(true);
    expect(isPersonalityType("XXXX")).toBe(false);
  });
});

describe("nível do conteúdo e som", () => {
  it("só níveis de 400 para cima", () => {
    expect(CONTENT_LEVELS.every((l) => l >= 400)).toBe(true);
    expect(isContentLevel(300)).toBe(false);
    expect(isContentLevel(540)).toBe(true);
  });
  it("o assobio tem 3 notas curtas, em sequência, dentro do audível", () => {
    expect(CHIME_NOTES).toHaveLength(3);
    for (const [from, to, at, dur] of CHIME_NOTES) {
      expect(from).toBeGreaterThan(200);
      expect(to).toBeLessThan(4000);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(dur).toBeLessThan(0.5);
    }
  });
});
