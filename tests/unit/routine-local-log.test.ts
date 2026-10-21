import { describe, expect, it } from "vitest";
import {
  HYDRATION_GOAL_DEFAULT_ML,
  KEY_PREFIX,
  addHydration,
  clampHydration,
  clampRestHours,
  formatGoalLiters,
  formatLiters,
  hydrationKey,
  readHydration,
  readHydrationGoal,
  readRest,
  restKey,
  storageAvailable,
  writeHydration,
  writeHydrationGoal,
  writeRest,
  type StorageLike,
} from "@/lib/routine/local-log";

// Registro local (hidratação e descanso): puro, recebe um Storage; tolera JSON corrompido e storage ausente.

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

// Modo privado em alguns navegadores: a API existe, mas gravar lança.
function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => undefined,
  };
}

const DAY = "2026-10-21";

describe("chaves", () => {
  it("usam o prefixo uh:today:<data>", () => {
    expect(hydrationKey(DAY)).toBe(`${KEY_PREFIX}${DAY}:hydration`);
    expect(restKey(DAY)).toBe("uh:today:2026-10-21:rest");
  });
});

describe("clamp", () => {
  it("hidratação: passos de 250, entre 0 e 6000", () => {
    expect(clampHydration(0)).toBe(0);
    expect(clampHydration(260)).toBe(250);
    expect(clampHydration(-500)).toBe(0);
    expect(clampHydration(9000)).toBe(6000);
    expect(clampHydration("x")).toBe(0);
    expect(clampHydration(Number.NaN)).toBe(0);
  });

  it("descanso: passos de 0,5 entre 0 e 14", () => {
    expect(clampRestHours(7.3)).toBe(7.5);
    expect(clampRestHours(7.2)).toBe(7);
    expect(clampRestHours(20)).toBe(14);
    expect(clampRestHours(-1)).toBe(0);
    expect(clampRestHours(undefined)).toBe(0);
  });
});

describe("hidratação", () => {
  it("começa em 0, soma em passos e grava por dia", () => {
    const storage = memoryStorage();
    expect(readHydration(storage, DAY)).toBe(0);
    expect(addHydration(storage, DAY, 250)).toBe(250);
    expect(addHydration(storage, DAY, 250)).toBe(500);
    expect(readHydration(storage, DAY)).toBe(500);
    expect(readHydration(storage, "2026-10-22")).toBe(0);
    expect(JSON.parse(storage.data.get(hydrationKey(DAY))!)).toEqual({ ml: 500 });
  });

  it("não passa de 6000 nem desce de 0", () => {
    const storage = memoryStorage();
    expect(addHydration(storage, DAY, -250)).toBe(0);
    writeHydration(storage, DAY, 5900);
    expect(addHydration(storage, DAY, 250)).toBe(6000);
  });

  it("tolera JSON corrompido e formatos antigos", () => {
    expect(readHydration(memoryStorage({ [hydrationKey(DAY)]: "{nope" }), DAY)).toBe(0);
    expect(readHydration(memoryStorage({ [hydrationKey(DAY)]: "750" }), DAY)).toBe(750);
    expect(readHydration(memoryStorage({ [hydrationKey(DAY)]: '{"ml":"abc"}' }), DAY)).toBe(0);
    expect(readHydration(memoryStorage({ [hydrationKey(DAY)]: "null" }), DAY)).toBe(0);
  });

  it("funciona sem storage (null) e com storage que lança", () => {
    expect(readHydration(null, DAY)).toBe(0);
    expect(writeHydration(null, DAY, 500)).toBe(500);
    expect(addHydration(throwingStorage(), DAY, 250)).toBe(250);
  });

  it("meta: padrão 2000, só aceita as opções e persiste", () => {
    const storage = memoryStorage();
    expect(readHydrationGoal(storage)).toBe(HYDRATION_GOAL_DEFAULT_ML);
    expect(writeHydrationGoal(storage, 2500)).toBe(2500);
    expect(readHydrationGoal(storage)).toBe(2500);
    expect(writeHydrationGoal(storage, 1234)).toBe(2000);
    expect(readHydrationGoal(memoryStorage({ "uh:today:hydration-goal": "4000" }))).toBe(2000);
    expect(readHydrationGoal(memoryStorage({ "uh:today:hydration-goal": "{" }))).toBe(2000);
  });

  it("formata litros no idioma", () => {
    expect(formatLiters(0, "pt-BR")).toBe("0,00 L");
    expect(formatLiters(1250, "pt-BR")).toBe("1,25 L");
    expect(formatLiters(1250, "en")).toBe("1.25 L");
    expect(formatGoalLiters(2000, "pt-BR")).toBe("2 L");
    expect(formatGoalLiters(1500, "pt-BR")).toBe("1,5 L");
    expect(formatGoalLiters(2500, "en")).toBe("2.5 L");
  });
});

describe("descanso", () => {
  it("começa vazio e grava rested + horas em passos de 0,5", () => {
    const storage = memoryStorage();
    expect(readRest(storage, DAY)).toEqual({ rested: false, hours: null });
    expect(writeRest(storage, DAY, { rested: true, hours: 7.3 })).toEqual({ rested: true, hours: 7.5 });
    expect(readRest(storage, DAY)).toEqual({ rested: true, hours: 7.5 });
    expect(writeRest(storage, DAY, { rested: false, hours: null })).toEqual({ rested: false, hours: null });
  });

  it("tolera JSON corrompido ou campos estranhos", () => {
    expect(readRest(memoryStorage({ [restKey(DAY)]: "[" }), DAY)).toEqual({ rested: false, hours: null });
    expect(readRest(memoryStorage({ [restKey(DAY)]: '{"rested":"yes","hours":"8"}' }), DAY)).toEqual({ rested: false, hours: null });
    expect(readRest(memoryStorage({ [restKey(DAY)]: '{"rested":true,"hours":99}' }), DAY)).toEqual({ rested: true, hours: 14 });
    expect(readRest(memoryStorage({ [restKey(DAY)]: "42" }), DAY)).toEqual({ rested: false, hours: null });
  });

  it("funciona sem storage", () => {
    expect(readRest(undefined, DAY)).toEqual({ rested: false, hours: null });
    expect(writeRest(throwingStorage(), DAY, { rested: true, hours: 8 })).toEqual({ rested: true, hours: 8 });
  });
});

describe("storageAvailable", () => {
  it("detecta storage funcional, ausente e que lança", () => {
    const storage = memoryStorage();
    expect(storageAvailable(storage)).toBe(true);
    expect(storage.data.size).toBe(0);
    expect(storageAvailable(null)).toBe(false);
    expect(storageAvailable(throwingStorage())).toBe(false);
  });
});
