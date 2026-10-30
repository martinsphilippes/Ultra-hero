import { describe, expect, it } from "vitest";
import {
  ANTI_SNIPE_MS,
  CONTACT_STATUSES,
  isContactStatus,
  bidderStanding,
  bidErrorCode,
  centsToInput,
  clockOffsetMs,
  collectiblePhase,
  countdownParts,
  durationToMinutes,
  endsAfterBid,
  formatCountdown,
  isUrgent,
  isValidIncrement,
  maskBidderName,
  minutesToDuration,
  nextBidAmount,
  normalizeIncrements,
  parseMoneyToCents,
  remainingMs,
} from "@/lib/collectibles/rules";

const T0 = Date.parse("2026-10-30T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("colecionáveis · regras do lance", () => {
  it("incremento só vale se for um dos configurados", () => {
    expect(isValidIncrement(1000, [1000, 5000, 10000])).toBe(true);
    expect(isValidIncrement(10000, [1000, 5000, 10000])).toBe(true);
    expect(isValidIncrement(2000, [1000, 5000, 10000])).toBe(false);
    expect(isValidIncrement(-1000, [1000])).toBe(false);
    expect(isValidIncrement(0, [0])).toBe(false);
    expect(isValidIncrement(10.5, [10.5])).toBe(false);
  });

  it("novo valor = atual + incremento (o 1º lance parte do preço inicial)", () => {
    expect(nextBidAmount(150000, 1000)).toBe(151000);
    expect(nextBidAmount(151000, 5000)).toBe(156000);
  });

  it("anti-sniping: lance nos 2 últimos minutos leva o fim para agora + 2 min", () => {
    const ends = T0 + 60_000;
    expect(endsAfterBid(ends, T0)).toEqual({ endsAtMs: T0 + ANTI_SNIPE_MS, extended: true });
    // com exatamente 2 min restantes não estende (regra do banco: restante < 2 min)
    expect(endsAfterBid(T0 + ANTI_SNIPE_MS, T0)).toEqual({ endsAtMs: T0 + ANTI_SNIPE_MS, extended: false });
    expect(endsAfterBid(T0 + 3_600_000, T0)).toEqual({ endsAtMs: T0 + 3_600_000, extended: false });
    // lances seguidos no fim continuam empurrando
    const first = endsAfterBid(T0 + 10_000, T0);
    const second = endsAfterBid(first.endsAtMs, T0 + 100_000);
    expect(second).toEqual({ endsAtMs: T0 + 100_000 + ANTI_SNIPE_MS, extended: true });
  });

  it("máscara do nome: igual à do banco (collectible_mask_label)", () => {
    expect(maskBidderName("Maria Silva")).toBe("Ma***a");
    expect(maskBidderName("  João   Souza ")).toBe("Jo***o");
    expect(maskBidderName("Ana")).toBe("A***");
    expect(maskBidderName("Zé")).toBe("Z***");
    expect(maskBidderName("")).toBeNull();
    expect(maskBidderName("   ")).toBeNull();
    expect(maskBidderName(null)).toBeNull();
    // nunca devolve o nome inteiro nem o sobrenome
    const masked = maskBidderName("Fernanda Oliveira")!;
    expect(masked).toBe("Fe***a");
    expect(masked).not.toContain("Oliveira");
  });

  it("incrementos do admin: 1 a 4, positivos, sem repetição, em ordem", () => {
    expect(normalizeIncrements([5000, 1000, 10000])).toEqual([1000, 5000, 10000]);
    expect(normalizeIncrements([1000])).toEqual([1000]);
    expect(normalizeIncrements([])).toBeNull();
    expect(normalizeIncrements([1, 2, 3, 4, 5])).toBeNull();
    expect(normalizeIncrements([1000, 1000])).toBeNull();
    expect(normalizeIncrements([0, 1000])).toBeNull();
  });

  it("duração: unidades viram minutos (5 min a 30 dias) e voltam", () => {
    expect(durationToMinutes(30, "minutes")).toBe(30);
    expect(durationToMinutes(2, "hours")).toBe(120);
    expect(durationToMinutes(1, "days")).toBe(1440);
    expect(durationToMinutes(4, "minutes")).toBeNull();
    expect(durationToMinutes(31, "days")).toBeNull();
    expect(minutesToDuration(1440)).toEqual({ amount: 1, unit: "days" });
    expect(minutesToDuration(120)).toEqual({ amount: 2, unit: "hours" });
    expect(minutesToDuration(45)).toEqual({ amount: 45, unit: "minutes" });
  });

  it("valores digitados pelo admin viram centavos", () => {
    expect(parseMoneyToCents("1500")).toBe(150000);
    expect(parseMoneyToCents("1.500")).toBe(150000);
    expect(parseMoneyToCents("1.500,50")).toBe(150050);
    expect(parseMoneyToCents("R$ 10")).toBe(1000);
    expect(parseMoneyToCents("10.5")).toBe(1050);
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("-5")).toBeNull();
    expect(centsToInput(150000)).toBe("1500");
    expect(centsToInput(150050)).toBe("1500,50");
  });

  it("fase efetiva igual a collectible_phase", () => {
    const starts = iso(T0);
    const ends = iso(T0 + 3_600_000);
    expect(collectiblePhase("draft", null, null, T0)).toBe("draft");
    expect(collectiblePhase("scheduled", starts, ends, T0 - 1)).toBe("scheduled");
    expect(collectiblePhase("scheduled", starts, ends, T0)).toBe("live");
    expect(collectiblePhase("live", starts, ends, T0 + 3_600_000)).toBe("ended");
    expect(collectiblePhase("cancelled", starts, ends, T0)).toBe("cancelled");
    expect(collectiblePhase("ended", starts, ends, T0)).toBe("ended");
  });

  it("situação de quem deu lance", () => {
    expect(bidderStanding({ phase: "live", leadingBidId: "b2", myBidIds: [] })).toBe("watching");
    expect(bidderStanding({ phase: "live", leadingBidId: "b2", myBidIds: ["b2"] })).toBe("winning");
    expect(bidderStanding({ phase: "live", leadingBidId: "b3", myBidIds: new Set(["b2"]) })).toBe("outbid");
    expect(bidderStanding({ phase: "ended", leadingBidId: "b3", myBidIds: ["b3"] })).toBe("won");
    expect(bidderStanding({ phase: "ended", leadingBidId: "b3", myBidIds: ["b1"] })).toBe("lost");
    expect(bidderStanding({ phase: "ended", leadingBidId: null, myBidIds: [], iWon: true })).toBe("won");
    expect(bidderStanding({ phase: "cancelled", leadingBidId: "b3", myBidIds: ["b3"] })).toBe("cancelled");
  });

  it("códigos de erro do banco", () => {
    expect(bidErrorCode("already_winning")).toBe("already_winning");
    expect(bidErrorCode('ERROR: rate_limited (P0001)')).toBe("rate_limited");
    expect(bidErrorCode("permission denied for function place_bid")).toBe("generic");
    expect(bidErrorCode(undefined)).toBe("generic");
  });
});

describe("colecionáveis · contagem regressiva", () => {
  it("dd hh:mm:ss, sem negativos", () => {
    expect(formatCountdown(0)).toBe("00:00:00");
    expect(formatCountdown(-5000)).toBe("00:00:00");
    expect(formatCountdown(59_999)).toBe("00:00:59");
    expect(formatCountdown(3_723_000)).toBe("01:02:03");
    expect(formatCountdown(2 * 86_400_000 + 3 * 3_600_000 + 4 * 60_000 + 5_000)).toBe("2d 03:04:05");
    expect(countdownParts(90_061_000)).toMatchObject({ days: 1, hours: 1, minutes: 1, seconds: 1 });
  });

  it("último minuto é urgente; encerrado não", () => {
    expect(isUrgent(60_000)).toBe(true);
    expect(isUrgent(1_000)).toBe(true);
    expect(isUrgent(60_001)).toBe(false);
    expect(isUrgent(0)).toBe(false);
  });

  it("offset do relógio: servidor adiantado/atrasado e latência", () => {
    // aparelho 5 s atrasado; resposta instantânea
    expect(clockOffsetMs(T0 + 5000, T0)).toBe(5000);
    // aparelho 3 s adiantado; ida e volta de 400 ms (o servidor respondeu no meio)
    expect(clockOffsetMs(T0, T0 + 3000 - 200, T0 + 3000 + 200)).toBe(-3000);
  });

  it("restante pelo relógio do servidor", () => {
    const ends = iso(T0 + 60_000);
    // aparelho 10 s atrasado: sem correção mostraria 70 s; com offset +10 s mostra 60 s
    expect(remainingMs(ends, T0 - 10_000, 10_000)).toBe(60_000);
    expect(remainingMs(ends, T0 + 120_000, 0)).toBe(0);
    expect(remainingMs(null, T0, 0)).toBe(0);
  });
});

describe("contato com o vencedor (sem pagamento online)", () => {
  it("aceita só as 3 situações da 0057, na ordem do andamento", () => {
    expect(CONTACT_STATUSES).toEqual(["pending", "contacted", "delivered"]);
    for (const s of CONTACT_STATUSES) expect(isContactStatus(s)).toBe(true);
    for (const s of ["none", "paid", "pending_payment", "", null, undefined, 1]) expect(isContactStatus(s)).toBe(false);
  });
});
