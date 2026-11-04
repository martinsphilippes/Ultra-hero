import { describe, expect, it } from "vitest";
import { isPasswordlessActive, PASSWORDLESS_UNTIL, passwordlessLastDayLabel, passwordlessUntil } from "@/lib/auth/passwordless";

// Período sem senha do evento: vale até 06/11/2026 00:00 de São Paulo e volta SOZINHO ao normal depois.

describe("isPasswordlessActive", () => {
  it("prazo padrão = 2026-11-06 08:00 em São Paulo (11:00 UTC)", () => {
    expect(PASSWORDLESS_UNTIL).toBe("2026-11-06T11:00:00Z");
    expect(passwordlessUntil({}).toISOString()).toBe("2026-11-06T11:00:00.000Z");
  });

  it("ativo antes do prazo, desligado a partir dele", () => {
    expect(isPasswordlessActive(new Date("2026-11-04T12:00:00Z"), {})).toBe(true);
    expect(isPasswordlessActive(new Date("2026-11-06T10:59:59Z"), {})).toBe(true);
    expect(isPasswordlessActive(new Date("2026-11-06T11:00:00Z"), {})).toBe(false);
    expect(isPasswordlessActive(new Date("2027-01-01T00:00:00Z"), {})).toBe(false);
  });

  it("kill switch PASSWORDLESS_DISABLED desliga na hora", () => {
    const now = new Date("2026-11-04T12:00:00Z");
    expect(isPasswordlessActive(now, { PASSWORDLESS_DISABLED: "1" })).toBe(false);
    expect(isPasswordlessActive(now, { PASSWORDLESS_DISABLED: "true" })).toBe(false);
    expect(isPasswordlessActive(now, { PASSWORDLESS_DISABLED: "0" })).toBe(true);
  });

  it("PASSWORDLESS_UNTIL substitui o prazo; valor inválido é ignorado", () => {
    const now = new Date("2026-11-04T12:00:00Z");
    expect(isPasswordlessActive(now, { PASSWORDLESS_UNTIL: "2026-11-04T00:00:00Z" })).toBe(false);
    expect(isPasswordlessActive(new Date("2026-11-07T00:00:00Z"), { PASSWORDLESS_UNTIL: "2026-11-08T03:00:00Z" })).toBe(true);
    expect(passwordlessUntil({ PASSWORDLESS_UNTIL: "amanhã" }).toISOString()).toBe("2026-11-06T11:00:00.000Z");
  });

  it("aviso mostra o fim (06/11 às 8h) em São Paulo", () => {
    expect(passwordlessLastDayLabel({})).toBe("06/11 às 8h");
  });
});
