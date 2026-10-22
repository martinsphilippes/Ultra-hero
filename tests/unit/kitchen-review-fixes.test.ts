import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALARM_REPEAT_LIMIT_MS, ALARM_REPEAT_MS, repeatAlarm } from "@/components/recipes/kitchen/alarm";
import { CookMode } from "@/components/recipes/kitchen/CookMode";
import { COOK_PROGRESS_TTL_MS, cookStorageKey, serializeCookProgress, staleCookKeys, type CookModel } from "@/lib/recipes/cook-mode";
import commonMessages from "../../messages/pt-BR/common.json";
import enKitchen from "../../messages/en/kitchen.json";
import esKitchen from "../../messages/es/kitchen.json";
import kitchenMessages from "../../messages/pt-BR/kitchen.json";
import recipesMessages from "../../messages/pt-BR/recipes.json";

// Correções da revisão independente da fase 4 (Modo Cozinha e coleção): alarme que repete até ser
// dispensado, progresso separado por conta, "(opcional)" sem parênteses duplos, alternâncias com
// rótulo fixo, "Anterior" que não perde o foco e o nome acessível que começa pelo texto visível.

vi.mock("@/app/(app)/content/actions", () => ({ completeContent: async () => ({ ok: true }) }));

const USER_A = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const USER_B = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
const RECIPE = "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f";

describe("alarme do cronômetro", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("repete a cada 5 s até ser dispensado", () => {
    vi.useFakeTimers();
    const ring = vi.fn();
    const stop = repeatAlarm(ring);
    vi.advanceTimersByTime(ALARM_REPEAT_MS * 3);
    expect(ring).toHaveBeenCalledTimes(3);
    stop(); // "Parar o alarme"
    vi.advanceTimersByTime(ALARM_REPEAT_MS * 10);
    expect(ring).toHaveBeenCalledTimes(3);
  });

  it("para sozinho depois de 2 min", () => {
    vi.useFakeTimers();
    const ring = vi.fn();
    repeatAlarm(ring);
    vi.advanceTimersByTime(ALARM_REPEAT_LIMIT_MS + ALARM_REPEAT_MS * 10);
    expect(ring).toHaveBeenCalledTimes(ALARM_REPEAT_LIMIT_MS / ALARM_REPEAT_MS);
  });
});

describe("progresso do Modo Cozinha por conta", () => {
  it("a chave leva a conta: outra conta no mesmo aparelho não lê o progresso", () => {
    expect(cookStorageKey(USER_A, RECIPE)).toBe(`uh-cook:${USER_A}:${RECIPE}`);
    expect(cookStorageKey(USER_A, RECIPE)).not.toBe(cookStorageKey(USER_B, RECIPE));
  });

  it("limpa o vencido, o ilegível e o formato antigo sem a conta; mantém o recente e o que não é do Modo Cozinha", () => {
    const now = 1_700_000_000_000;
    const fresh = serializeCookProgress({ step: 1, done: [], timers: [] }, now - 1000);
    const old = serializeCookProgress({ step: 1, done: [], timers: [] }, now - COOK_PROGRESS_TTL_MS - 1);
    const entries: [string, string | null][] = [
      [cookStorageKey(USER_A, RECIPE), fresh],
      [cookStorageKey(USER_B, RECIPE), old],
      [`uh-cook:${RECIPE}`, fresh],
      [`uh-cook:${USER_A}:outra`, "{"],
      ["uh-cook-sound", "off"],
      ["uh-theme", "dark"],
    ];
    expect(staleCookKeys(entries, now)).toEqual([cookStorageKey(USER_B, RECIPE), `uh-cook:${RECIPE}`, `uh-cook:${USER_A}:outra`]);
  });
});

const model: CookModel = {
  contentId: RECIPE,
  slug: "bowl",
  title: "Bowl",
  baseServings: 2,
  servings: null,
  ingredients: [
    { id: "i1", name: "Frango", amount: "300 g", approx: false, toTaste: false, optional: false, note: null, notScaled: false },
    { id: "i2", name: "Cebolinha", amount: null, approx: false, toTaste: true, optional: true, note: null, notScaled: false },
  ],
  steps: [
    {
      id: "s1",
      number: 1,
      instruction: "Grelhe o frango.",
      durationSeconds: 600,
      temperatureC: null,
      tip: null,
      image: null,
      ingredients: [{ id: "i2", name: "Cebolinha", amount: null, approx: false, toTaste: true, optional: true, note: null, notScaled: false }],
    },
    { id: "s2", number: 2, instruction: "Sirva.", durationSeconds: null, temperatureC: null, tip: null, image: null, ingredients: [] },
  ],
};

function renderCookMode() {
  return renderToStaticMarkup(
    // arquivo .ts (sem JSX): o tipo do provider exige children nas props
    // eslint-disable-next-line react/no-children-prop
    createElement(NextIntlClientProvider, {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      messages: { kitchen: kitchenMessages, recipes: recipesMessages, common: commonMessages },
      children: createElement(CookMode, { model, userId: USER_A, recipeHref: "/content/bowl", completedLabel: null }),
    }),
  );
}

describe("Modo Cozinha renderizado", () => {
  it("ingrediente opcional com um par de parênteses só", () => {
    const html = renderCookMode();
    expect(html).toContain("(opcional)");
    expect(html).not.toContain("((opcional))");
  });

  it("'Anterior' na primeira etapa fica aria-disabled, sem disabled (o foco não cai no <body>)", () => {
    const html = renderCookMode();
    const prev = html.match(/<button[^>]*data-testid="cook-prev"[^>]*>/)?.[0] ?? "";
    expect(prev).toContain('aria-disabled="true"');
    expect(prev).not.toMatch(/\sdisabled=""/);
  });

  it("som do alarme é um interruptor com rótulo fixo; a etapa concluída usa aria-pressed com rótulo fixo", () => {
    const html = renderCookMode();
    const sound = html.match(/<button[^>]*data-testid="cook-sound"[^>]*>/)?.[0] ?? "";
    expect(sound).toContain('role="switch"');
    expect(sound).toContain('aria-checked="true"');
    expect(html).toContain("Som do alarme");
    expect(html).not.toContain("Som do alarme ligado");
    expect(html).not.toContain("Marcar etapa como concluída");
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*data-testid="cook-step-done"[^>]*>.*?Etapa concluída/);
  });

  it("tem uma região educada para anunciar o início do cronômetro", () => {
    const html = renderCookMode();
    expect(html).toMatch(/<p role="status" aria-live="polite"[^>]*data-testid="cook-status"/);
    expect(kitchenMessages.cook.timer.started).toContain("{time}");
  });
});

describe("nome acessível dos botões da coleção", () => {
  it("'Tirar do histórico' e 'Remover' começam pelo texto visível nos 3 idiomas (WCAG 2.5.3)", () => {
    for (const m of [kitchenMessages, enKitchen, esKitchen]) {
      expect(m.collection.history.removeLabel.startsWith(m.collection.history.remove)).toBe(true);
      expect(m.collection.saved.removeLabel.startsWith(m.collection.saved.remove)).toBe(true);
    }
  });
});
