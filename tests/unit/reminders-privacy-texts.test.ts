import { describe, expect, it } from "vitest";
import ptLegal from "../../messages/pt-BR/legal.json";
import enLegal from "../../messages/en/legal.json";
import esLegal from "../../messages/es/legal.json";
import ptMe from "../../messages/pt-BR/me.json";
import enMe from "../../messages/en/me.json";
import esMe from "../../messages/es/me.json";

// Textos de privacidade dos Lembretes (Q5/Q10): a sequência da 0037 conta streak_events, que inclui
// entrar em programa (enroll_program grava kind 'enrollment'), e os lembretes são dados guardados e
// apagados com a conta — o resumo da Conta e a Política têm de dizer isso nos 3 idiomas.
const locales = [
  { name: "pt-BR", legal: ptLegal, me: ptMe, enrollment: /entradas em programas/, reminders: /lembretes e marcações/ },
  { name: "en", legal: enLegal, me: enMe, enrollment: /program enrollments/, reminders: /reminders and check marks/ },
  { name: "es", legal: esLegal, me: esMe, enrollment: /inscripciones en programas/, reminders: /recordatorios y sus marcas/ },
];

describe.each(locales)("textos de Lembretes — $name", ({ legal, me, enrollment, reminders }) => {
  it("a Política não diz que a sequência conta só conteúdos concluídos", () => {
    const routine = legal.privacy.sections.collected.blocks.list1.routine;
    expect(routine).toMatch(enrollment);
    expect(routine).not.toMatch(/só conteúdos|only completed|solo contenidos/);
  });

  it("o que é apagado com a conta e o resumo 'O que guardamos' citam lembretes e marcações", () => {
    expect(legal.privacy.sections.rights.blocks.list2.removed).toMatch(reminders);
    expect(me.account.store.item2).toMatch(reminders);
  });
});
