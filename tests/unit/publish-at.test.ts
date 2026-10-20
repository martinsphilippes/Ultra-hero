import { describe, expect, it } from "vitest";
import { MIN_LEAD_MS, isScheduled, isoToLocalInput, localInputToIso, parsePublishAt } from "@/components/admin-content/lib/publish-at";

// Agendamento de publicação (RF-007): parsing do campo "Publicar em" do admin.
const NOW = new Date("2026-10-20T15:00:00.000Z");

describe("parsePublishAt (campo 'Publicar em' do admin)", () => {
  it.each(["", "   ", null, undefined])("vazio (%j) significa publicar agora (null)", (input) => {
    expect(parsePublishAt(input, NOW)).toEqual({ ok: true, value: null });
  });

  it("aceita data futura e devolve ISO normalizado em UTC", () => {
    expect(parsePublishAt("2026-10-21T12:30:00.000Z", NOW)).toEqual({ ok: true, value: "2026-10-21T12:30:00.000Z" });
    expect(parsePublishAt("2026-10-21T09:30:00-03:00", NOW)).toEqual({ ok: true, value: "2026-10-21T12:30:00.000Z" });
  });

  it.each(["ontem", "2026-13-45T00:00", "20/10/2026 15:00", "not-a-date"])("rejeita data ilegível %j", (input) => {
    expect(parsePublishAt(input, NOW)).toEqual({ ok: false, error: "publish_at_invalid" });
  });

  it("rejeita data no passado e 'agora mesmo' (antecedência mínima de 1 minuto)", () => {
    expect(parsePublishAt("2026-10-20T14:59:00.000Z", NOW)).toEqual({ ok: false, error: "publish_at_future" });
    expect(parsePublishAt(NOW.toISOString(), NOW)).toEqual({ ok: false, error: "publish_at_future" });
    expect(parsePublishAt(new Date(NOW.getTime() + MIN_LEAD_MS - 1).toISOString(), NOW)).toEqual({ ok: false, error: "publish_at_future" });
    expect(parsePublishAt(new Date(NOW.getTime() + MIN_LEAD_MS).toISOString(), NOW)).toEqual({ ok: true, value: "2026-10-20T15:01:00.000Z" });
  });

  it("usa o relógio real por padrão: um ano à frente é aceito", () => {
    const next = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(parsePublishAt(next)).toEqual({ ok: true, value: next });
  });
});

describe("localInputToIso / isoToLocalInput (datetime-local)", () => {
  it("converte o valor do campo (hora local do dispositivo) para ISO UTC", () => {
    const iso = localInputToIso("2026-10-21T09:30");
    expect(iso).not.toBeNull();
    // mesma interpretação que o navegador: new Date("YYYY-MM-DDTHH:mm") é hora local
    expect(iso).toBe(new Date("2026-10-21T09:30").toISOString());
  });

  it.each(["", "2026-10-21", "21/10/2026 09:30", "2026-10-21T9:30", "abc"])("valor fora do formato datetime-local %j vira null", (value) => {
    expect(localInputToIso(value)).toBeNull();
  });

  it("isoToLocalInput preenche o campo no fuso pedido (ida e volta estável)", () => {
    expect(isoToLocalInput("2026-10-21T12:30:00.000Z", "America/Sao_Paulo")).toBe("2026-10-21T09:30");
    expect(isoToLocalInput("2026-10-21T12:30:00.000Z", "UTC")).toBe("2026-10-21T12:30");
    expect(isoToLocalInput("2026-10-21T00:10:00.000Z", "UTC")).toBe("2026-10-21T00:10");
    expect(isoToLocalInput("inválido", "UTC")).toBe("");
  });
});

describe("isScheduled (mesma regra de public.content_is_live, invertida)", () => {
  it("publicado com publish_at no futuro é agendado; no passado ou nulo está no ar", () => {
    expect(isScheduled("published", "2026-10-21T00:00:00.000Z", NOW)).toBe(true);
    expect(isScheduled("published", "2026-10-20T14:00:00.000Z", NOW)).toBe(false);
    expect(isScheduled("published", null, NOW)).toBe(false);
  });

  it("rascunho ou arquivado nunca são 'agendados', mesmo com data futura", () => {
    expect(isScheduled("draft", "2026-10-21T00:00:00.000Z", NOW)).toBe(false);
    expect(isScheduled("archived", "2026-10-21T00:00:00.000Z", NOW)).toBe(false);
  });

  it("data ilegível não agenda", () => {
    expect(isScheduled("published", "x", NOW)).toBe(false);
  });
});
