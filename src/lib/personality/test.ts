// Teste de personalidade do Ultra (reunião Groscove, 06/11/2026): 16 tipos, nos mesmos 4 eixos conhecidos
// (Energia E/I, Percepção S/N, Decisão T/F, Estilo J/P). O questionário e os nomes dos tipos são próprios do Ultra
// (o do 16personalities é protegido). 32 frases, 8 por eixo, respostas de 1 (discordo) a 5 (concordo). Cada frase
// puxa para uma letra do eixo; a pontuação do eixo vai de 0 a 100 para a primeira letra. Módulo puro (testável).

export const AXES = ["EI", "SN", "TF", "JP"] as const;
export type Axis = (typeof AXES)[number];

/** id da frase → eixo e a letra para a qual ela puxa (o texto vem das mensagens: personality.questions.<id>). */
export const QUESTIONS: ReadonlyArray<{ id: string; axis: Axis; toward: string }> = [
  { id: "e1", axis: "EI", toward: "E" }, { id: "e2", axis: "EI", toward: "E" }, { id: "e3", axis: "EI", toward: "E" }, { id: "e4", axis: "EI", toward: "E" },
  { id: "i1", axis: "EI", toward: "I" }, { id: "i2", axis: "EI", toward: "I" }, { id: "i3", axis: "EI", toward: "I" }, { id: "i4", axis: "EI", toward: "I" },
  { id: "s1", axis: "SN", toward: "S" }, { id: "s2", axis: "SN", toward: "S" }, { id: "s3", axis: "SN", toward: "S" }, { id: "s4", axis: "SN", toward: "S" },
  { id: "n1", axis: "SN", toward: "N" }, { id: "n2", axis: "SN", toward: "N" }, { id: "n3", axis: "SN", toward: "N" }, { id: "n4", axis: "SN", toward: "N" },
  { id: "t1", axis: "TF", toward: "T" }, { id: "t2", axis: "TF", toward: "T" }, { id: "t3", axis: "TF", toward: "T" }, { id: "t4", axis: "TF", toward: "T" },
  { id: "f1", axis: "TF", toward: "F" }, { id: "f2", axis: "TF", toward: "F" }, { id: "f3", axis: "TF", toward: "F" }, { id: "f4", axis: "TF", toward: "F" },
  { id: "j1", axis: "JP", toward: "J" }, { id: "j2", axis: "JP", toward: "J" }, { id: "j3", axis: "JP", toward: "J" }, { id: "j4", axis: "JP", toward: "J" },
  { id: "p1", axis: "JP", toward: "P" }, { id: "p2", axis: "JP", toward: "P" }, { id: "p3", axis: "JP", toward: "P" }, { id: "p4", axis: "JP", toward: "P" },
];

/** Ordem de apresentação: intercalada (um eixo de cada vez), para não repetir o mesmo tema seguido. */
export const QUESTION_ORDER: string[] = (() => {
  const byAxis = AXES.map((a) => QUESTIONS.filter((q) => q.axis === a));
  const out: string[] = [];
  for (let i = 0; i < 8; i++) for (const list of byAxis) out.push(list[i]!.id);
  return out;
})();

export type Answers = Record<string, number>;

/** Pontuação por eixo (0–100 para a primeira letra) e o tipo de 4 letras. Resposta faltando conta como 3 (neutro). */
export function scorePersonality(answers: Answers): { type: string; scores: Record<Axis, number> } {
  const scores = {} as Record<Axis, number>;
  let type = "";
  for (const axis of AXES) {
    const first = axis[0];
    const qs = QUESTIONS.filter((q) => q.axis === axis);
    // cada resposta vira -2..+2 a favor da primeira letra
    let sum = 0;
    for (const q of qs) {
      const v = Math.min(5, Math.max(1, Math.round(answers[q.id] ?? 3)));
      sum += (q.toward === first ? 1 : -1) * (v - 3);
    }
    const max = qs.length * 2;
    const pct = Math.round(((sum + max) / (2 * max)) * 100);
    scores[axis] = pct;
    type += pct >= 50 ? first : axis[1];
  }
  return { type, scores };
}

export function isPersonalityType(value: unknown): value is string {
  return typeof value === "string" && /^[EI][SN][TF][JP]$/.test(value);
}
