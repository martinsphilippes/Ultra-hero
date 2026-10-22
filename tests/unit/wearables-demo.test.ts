import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { indexCardKind, sectionAvailable } from "@/components/me/today/watch-helpers";
import { metricDef, modelMeasures, type MetricCode } from "@/lib/wearables/catalog";
import { isDemoUser, localNow, resolveWatchView } from "@/lib/wearables/context";
import { DEMO_PERSONAS, dayIndexOf, demoPersonaFor, generateWatchDay, HISTORY_DAYS, ymdOf, type DemoPersonaKey, type WatchSnapshot } from "@/lib/wearables/demo";
import { pearson } from "@/lib/wearables/derived";

// Gerador determinístico do "relógio simulado" (§9.9): mesma conta + data → mesmos números, só o
// que o modelo mede (RN-22), valores plausíveis (RN-12) e coerência entre métricas.

const PERSONAS = Object.keys(DEMO_PERSONAS) as DemoPersonaKey[];

// Um ano de dias completos por persona (cada snapshot traz 30 dias de histórico).
function yearOf(persona: DemoPersonaKey) {
  const start = dayIndexOf("2026-01-01");
  const days: WatchSnapshot["history"] = [];
  for (let i = HISTORY_DAYS; i <= 365 + HISTORY_DAYS; i += HISTORY_DAYS) {
    days.push(...generateWatchDay(persona, ymdOf(start + i), 1439).history.slice(0, -1));
  }
  return days;
}
const YEARS = Object.fromEntries(PERSONAS.map((p) => [p, yearOf(p)])) as Record<DemoPersonaKey, WatchSnapshot["history"]>;

function pairs(days: WatchSnapshot["history"], a: MetricCode, b: MetricCode): [number[], number[]] {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const d of days) {
    const x = d.values[a];
    const y = d.values[b];
    if (typeof x === "number" && typeof y === "number") {
      xs.push(x);
      ys.push(y);
    }
  }
  return [xs, ys];
}

describe("gerador do relógio simulado", () => {
  it("é determinístico por conta + data + horário", () => {
    for (const persona of PERSONAS) {
      expect(generateWatchDay(persona, "2026-10-22", 640)).toEqual(generateWatchDay(persona, "2026-10-22", 640));
    }
    expect(generateWatchDay("premium", "2026-10-22", 640)).not.toEqual(generateWatchDay("premium", "2026-10-21", 640));
    expect(generateWatchDay("premium", "2026-10-22", 640).values).not.toEqual(generateWatchDay("free", "2026-10-22", 640).values);
  });

  it("um dia passado tem os mesmos números em qualquer janela que o inclua", () => {
    const a = generateWatchDay("creator", "2026-10-22", 900).history.find((d) => d.date === "2026-10-10");
    const b = generateWatchDay("creator", "2026-10-15", 300).history.find((d) => d.date === "2026-10-10");
    // derivados de janela (carga 7/28 dias, regularidade) dependem do que veio antes; o medido não
    for (const code of ["steps", "sleep_asleep_min", "hr_resting", "hrv_night", "body_battery_high", "stress_avg"] as MetricCode[]) expect(a?.values[code], code).toBe(b?.values[code]);
  });

  it("só emite o que o modelo simulado mede (catálogo ∩ matriz) e nada fora da faixa plausível", () => {
    for (const persona of PERSONAS) {
      const model = DEMO_PERSONAS[persona].model;
      const snap = generateWatchDay(persona, "2026-10-22", 18 * 60);
      for (const code of Object.keys(snap.values)) expect(modelMeasures(model, code), `${persona}:${code}`).toBe(true);
      for (const day of [...YEARS[persona], ...snap.history]) {
        for (const [code, value] of Object.entries(day.values)) {
          expect(modelMeasures(model, code), `${persona}:${code}`).toBe(true);
          const plaus = metricDef(code)?.plaus;
          if (plaus) {
            expect(value, `${persona}:${day.date}:${code}`).toBeGreaterThanOrEqual(plaus[0]);
            expect(value, `${persona}:${day.date}:${code}`).toBeLessThanOrEqual(plaus[1]);
          }
        }
      }
    }
  });

  it("Galaxy (Health Connect) nunca emite VFC, FC de repouso, temperatura, respiração, andares, Disposição nem estresse", () => {
    const banned = ["hrv_night", "hr_resting", "skin_temp_delta_c", "skin_temp_c", "resp_rate_sleep", "resp_rate_day_avg", "floors_climbed", "floors_descended", "disposition_uh", "stress_avg"];
    for (const day of YEARS.seller) for (const code of banned) expect(day.values[code as MetricCode], code).toBeUndefined();
    const snap = generateWatchDay("seller", "2026-10-22", 15 * 60);
    expect(snap.disposition).toBeNull();
    expect(indexCardKind(snap)).toBeNull();
    expect(sectionAvailable(snap, "readiness")).toBe(false);
    expect(sectionAvailable(snap, "stress")).toBe(false);
    expect(sectionAvailable(snap, "environment")).toBe(false);
  });

  it("métrica não medida fica escondida, nunca zero (Apple Series 11: sem SpO₂; VFC com < 2 leituras some)", () => {
    for (const day of YEARS.admin) {
      expect(day.values.spo2_night_avg).toBeUndefined();
      expect(day.values.body_battery_now).toBeUndefined();
      expect(day.values.hrv_night === 0).toBe(false);
    }
    const withoutHrv = YEARS.admin.filter((d) => d.values.sleep_asleep_min !== undefined && d.values.hrv_night === undefined);
    const withHrv = YEARS.admin.filter((d) => d.values.hrv_night !== undefined);
    expect(withoutHrv.length).toBeGreaterThan(10);
    expect(withHrv.length).toBeGreaterThan(withoutHrv.length);
    // Series 12 tem VFC em todas as noites
    expect(YEARS.premium.every((d) => d.values.hrv_night !== undefined)).toBe(true);
  });

  it("é coerente: noite pior → VFC menor, FC de repouso maior e Disposição menor", () => {
    for (const persona of PERSONAS.filter((p) => p !== "seller")) {
      const days = YEARS[persona];
      expect(pearson(...pairs(days, "sleep_asleep_min", "hrv_night")), `${persona} sono×VFC`).toBeGreaterThan(0.3);
      expect(pearson(...pairs(days, "sleep_asleep_min", "disposition_uh")), `${persona} sono×Disposição`).toBeGreaterThan(0.4);
      expect(pearson(...pairs(days, "hr_resting", "hrv_night")), `${persona} FC rep.×VFC`).toBeLessThan(-0.3);
    }
  });

  it("dia parcial: acumulados crescem com a hora e o selo 'até HH:MM' vem antes de agora", () => {
    const morning = generateWatchDay("free", "2026-10-22", 10 * 60);
    const evening = generateWatchDay("free", "2026-10-22", 20 * 60);
    expect(morning.syncedAt).toBeLessThanOrEqual(10 * 60);
    expect(morning.syncedAt).toBeGreaterThanOrEqual(10 * 60 - 18);
    expect(morning.values.steps!.value).toBeLessThan(evening.values.steps!.value);
    expect(morning.values.steps!.at).toBe(morning.syncedAt);
    // a noite é a mesma (fechada) de manhã e à noite
    expect(morning.values.sleep_asleep_min).toEqual(evening.values.sleep_asleep_min);
    expect(morning.history).toHaveLength(HISTORY_DAYS);
    expect(morning.history[HISTORY_DAYS - 1]).toMatchObject({ date: "2026-10-22", partial: true });
  });

  it("antes de o relógio sincronizar depois do despertar, mostra a última noite com a data dela", () => {
    const early = generateWatchDay("premium", "2026-10-22", 4 * 60);
    expect(early.night?.isToday).toBe(false);
    expect(early.night?.date).toBe("2026-10-21");
    expect(early.values.sleep_asleep_min?.date).toBe("2026-10-21");
    expect(early.history[HISTORY_DAYS - 1].values.sleep_asleep_min).toBeUndefined();
  });

  it("índices: Garmin tem Body Battery principal; Apple tem Disposição Ultra Hero principal", () => {
    expect(indexCardKind(generateWatchDay("free", "2026-10-22", 600))).toBe("body_battery");
    expect(indexCardKind(generateWatchDay("creator", "2026-10-22", 600))).toBe("body_battery");
    expect(indexCardKind(generateWatchDay("premium", "2026-10-22", 600))).toBe("disposition");
    expect(indexCardKind(generateWatchDay("example", "2026-10-22", 600))).toBe("disposition");
  });

  it("não grava nem envia nada: o módulo não importa banco, rede nem analytics", () => {
    for (const file of ["demo.ts", "derived.ts", "catalog.ts", "context.ts", "format.ts"]) {
      const source = readFileSync(path.join(process.cwd(), "src/lib/wearables", file), "utf8");
      expect(source.match(/^import .*$/gm)?.join("\n") ?? "", file).not.toMatch(/supabase|analytics|server-only|next\//);
      expect(source, file).not.toMatch(/\bfetch\(|localStorage\.|createClient\(|\.from\(\"/);
    }
  });
});

describe("quem vê qual Hoje", () => {
  it("persona só para conta demo (marcador em app_metadata), pelo e-mail fixo ou pelo papel", () => {
    expect(demoPersonaFor({ isDemo: false, email: "premium@demo.ultrahero.app", roles: [] })).toBeNull();
    expect(demoPersonaFor({ isDemo: true, email: "premium@demo.ultrahero.app", roles: ["consumer"] })).toBe("premium");
    expect(demoPersonaFor({ isDemo: true, email: "GRATUITO@demo.ultrahero.app", roles: [] })).toBe("free");
    expect(demoPersonaFor({ isDemo: true, email: "heroi@demo.ultrahero.app", roles: ["creator"] })).toBe("creator");
    expect(demoPersonaFor({ isDemo: true, email: "outra@exemplo.com", roles: ["seller"] })).toBe("seller");
    expect(DEMO_PERSONAS.premium.model).toBe("apple_s12");
    expect(DEMO_PERSONAS.free.model).toBe("garmin_vivo");
    expect(DEMO_PERSONAS.creator.model).toBe("garmin_fenix");
    expect(DEMO_PERSONAS.seller.model).toBe("galaxy");
    expect(DEMO_PERSONAS.admin.model).toBe("apple_se3");
  });

  it("marcador em user_metadata (editável pela pessoa) não vale", () => {
    expect(isDemoUser({ app_metadata: { ultra_hero_demo: true } })).toBe(true);
    expect(isDemoUser({ app_metadata: { ultra_hero_demo: "true" } })).toBe(false);
    expect(isDemoUser({ app_metadata: {}, ...({ user_metadata: { ultra_hero_demo: true } } as object) })).toBe(false);
  });

  it("conta real vê 'Conectar relógio'; com ?exemplo=1, o exemplo separado", () => {
    const now = new Date("2026-10-22T13:42:00Z");
    const real = { email: "pessoa@exemplo.com", app_metadata: {} };
    expect(resolveWatchView({ user: real, roles: ["consumer"], timeZone: "America/Sao_Paulo", example: false, now }).kind).toBe("connect");
    const example = resolveWatchView({ user: real, roles: ["consumer"], timeZone: "America/Sao_Paulo", example: true, now });
    expect(example.kind).toBe("example");
    if (example.kind === "example") expect(example.snapshot.date).toBe("2026-10-22");
    const demo = resolveWatchView({ user: { email: "premium@demo.ultrahero.app", app_metadata: { ultra_hero_demo: true } }, roles: ["consumer"], timeZone: "America/Sao_Paulo", example: true, now });
    expect(demo.kind).toBe("demo");
  });

  it("data e hora no fuso da pessoa", () => {
    const now = new Date("2026-10-22T02:30:00Z");
    expect(localNow("America/Sao_Paulo", now)).toEqual({ date: "2026-10-21", minutes: 23 * 60 + 30 });
    expect(localNow("Asia/Tokyo", now)).toEqual({ date: "2026-10-22", minutes: 11 * 60 + 30 });
    expect(localNow("UTC", new Date("2026-10-22T00:05:00Z"))).toEqual({ date: "2026-10-22", minutes: 5 });
  });
});
