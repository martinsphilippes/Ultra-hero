import { describe, expect, it } from "vitest";
import { formatCurrency, formatDuration, formatRelativeTime } from "@/i18n/format";
import { localizedLabel } from "@/lib/catalog/queries";
import { rpcErrorCode } from "@/lib/supabase/helpers";

describe("formatCurrency", () => {
  it("formata BRL por padrão em pt-BR", () => {
    expect(formatCurrency(29.9, "pt-BR").replace(/ /g, " ")).toBe("R$ 29,90");
  });
  it("respeita o idioma", () => {
    expect(formatCurrency(29.9, "en")).toBe("R$29.90");
  });
});

describe("formatDuration", () => {
  it("minutos e horas", () => {
    expect(formatDuration(45)).toBe("45min");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h 30min");
    expect(formatDuration(-5)).toBe("0min");
  });
});

describe("formatRelativeTime", () => {
  it("usa unidade adequada", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    expect(formatRelativeTime("2026-10-17T12:00:00Z", "pt-BR", now)).toMatch(/3 dias/);
    expect(formatRelativeTime("2026-10-20T11:00:00Z", "en", now)).toMatch(/hour/);
  });
});

describe("localizedLabel", () => {
  const label = { "pt-BR": "Refeições", en: "Meals" };
  it("retorna o idioma pedido com fallback pt-BR", () => {
    expect(localizedLabel(label, "en")).toBe("Meals");
    expect(localizedLabel(label, "es")).toBe("Refeições");
    expect(localizedLabel(null, "en")).toBe("");
  });
});

describe("rpcErrorCode", () => {
  it("extrai o código antes dos dois-pontos", () => {
    expect(rpcErrorCode("cart_changed: [{...}]")).toBe("cart_changed");
    expect(rpcErrorCode("protected_column: status")).toBe("protected_column");
    expect(rpcErrorCode(undefined)).toBe("unknown");
  });
});
