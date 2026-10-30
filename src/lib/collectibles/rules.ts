// Regras puras dos Colecionáveis (lances ao vivo). Espelham o banco (0054): o servidor decide,
// estas funções servem para a tela antecipar o resultado e para os testes unitários.

export type CollectibleStatus = "draft" | "scheduled" | "live" | "ended" | "cancelled";
export type CollectiblePhase = CollectibleStatus;

/** Anti-sniping: lance nos últimos 2 min leva o fim para agora + 2 min. */
export const ANTI_SNIPE_MS = 2 * 60 * 1000;
/** Limite: 1 lance a cada 2 s por pessoa e item. */
export const BID_RATE_LIMIT_MS = 2000;
/** Último minuto: contagem regressiva em destaque. */
export const URGENT_MS = 60 * 1000;
export const MAX_INCREMENTS = 4;
export const DEFAULT_INCREMENTS_CENTS = [1000, 5000, 10000] as const;

/** Fase efetiva (igual a public.collectible_phase): agendado vira ao vivo no início, tudo encerra no fim. */
export function collectiblePhase(
  status: string,
  startsAt: string | null,
  endsAt: string | null,
  nowMs: number,
): CollectiblePhase {
  if (status === "draft" || status === "cancelled" || status === "ended") return status;
  if (!startsAt || !endsAt) return "draft";
  if (nowMs >= Date.parse(endsAt)) return "ended";
  if (nowMs >= Date.parse(startsAt)) return "live";
  return "scheduled";
}

/** "Maria Silva" → "Ma***a"; "Ana" → "A***"; vazio → null (a tela mostra "Participante"). */
export function maskBidderName(name: string | null | undefined): string | null {
  const word = (name ?? "").trim().replace(/\s+/g, " ").split(" ")[0] ?? "";
  const chars = Array.from(word);
  if (chars.length === 0) return null;
  if (chars.length >= 4) return `${chars.slice(0, 2).join("")}***${chars[chars.length - 1]}`;
  return `${chars[0]}***`;
}

/** Incremento válido = um dos configurados pelo admin. */
export function isValidIncrement(increment: number, increments: readonly number[]): boolean {
  return Number.isInteger(increment) && increment > 0 && increments.includes(increment);
}

/** Novo valor = preço atual + incremento (o 1º lance = preço inicial + incremento). */
export function nextBidAmount(currentCents: number, incrementCents: number): number {
  return currentCents + incrementCents;
}

/** Fim depois de um lance feito em `bidAtMs` (anti-sniping). */
export function endsAfterBid(endsAtMs: number, bidAtMs: number): { endsAtMs: number; extended: boolean } {
  if (endsAtMs - bidAtMs < ANTI_SNIPE_MS) return { endsAtMs: bidAtMs + ANTI_SNIPE_MS, extended: true };
  return { endsAtMs, extended: false };
}

/** Lista de incrementos do formulário do admin: 1 a 4 valores inteiros positivos, sem repetição, em ordem. */
export function normalizeIncrements(values: readonly number[]): number[] | null {
  const list = values.filter((v) => Number.isFinite(v)).map((v) => Math.round(v));
  if (list.length < 1 || list.length > MAX_INCREMENTS) return null;
  if (list.some((v) => v <= 0 || v > 10_000_000)) return null;
  if (new Set(list).size !== list.length) return null;
  return [...list].sort((a, b) => a - b);
}

/** Valor digitado pelo admin ("1.500", "1500,50", "R$ 10") → centavos; null se inválido. */
export function parseMoneyToCents(input: string): number | null {
  const s = input.trim().replace(/R\$|\s/g, "");
  if (!s) return null;
  let normalized = s;
  if (s.includes(",")) normalized = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Centavos → texto editável no formulário ("1500" ou "1500,50"). */
export function centsToInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", ",");
}

export type DurationUnit = "minutes" | "hours" | "days";
const UNIT_MINUTES: Record<DurationUnit, number> = { minutes: 1, hours: 60, days: 1440 };

/** Duração do formulário → minutos (5 min a 30 dias), ou null se fora do intervalo. */
export function durationToMinutes(amount: number, unit: DurationUnit): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const minutes = Math.round(amount * UNIT_MINUTES[unit]);
  return minutes >= 5 && minutes <= 43200 ? minutes : null;
}

/** Minutos → melhor unidade para mostrar no formulário. */
export function minutesToDuration(minutes: number): { amount: number; unit: DurationUnit } {
  if (minutes % 1440 === 0) return { amount: minutes / 1440, unit: "days" };
  if (minutes % 60 === 0) return { amount: minutes / 60, unit: "hours" };
  return { amount: minutes, unit: "minutes" };
}

// ---------------------------------------------------------------- contagem regressiva
export type CountdownParts = { days: number; hours: number; minutes: number; seconds: number; totalMs: number };

export function countdownParts(remainingMs: number): CountdownParts {
  const totalMs = Math.max(0, remainingMs);
  const totalSeconds = Math.floor(totalMs / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalMs,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2d 03:04:05" com dias; "03:04:05" sem; nunca negativo. */
export function formatCountdown(remainingMs: number): string {
  const p = countdownParts(remainingMs);
  const clock = `${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}`;
  return p.days > 0 ? `${p.days}d ${clock}` : clock;
}

export function isUrgent(remainingMs: number): boolean {
  return remainingMs > 0 && remainingMs <= URGENT_MS;
}

/**
 * Diferença entre o relógio do servidor e o do aparelho. `serverNowMs` é a hora do servidor na resposta,
 * `sentAtMs`/`receivedAtMs` são as horas locais do pedido e da resposta: o servidor respondeu, em média,
 * no meio do caminho. Somar o offset à hora local dá a hora do servidor.
 */
export function clockOffsetMs(serverNowMs: number, sentAtMs: number, receivedAtMs: number = sentAtMs): number {
  const midpoint = sentAtMs + (receivedAtMs - sentAtMs) / 2;
  return Math.round(serverNowMs - midpoint);
}

/** Tempo restante pelo relógio do servidor (hora local corrigida pelo offset). */
export function remainingMs(endsAtIso: string | null, localNowMs: number, offsetMs: number): number {
  if (!endsAtIso) return 0;
  return Math.max(0, Date.parse(endsAtIso) - (localNowMs + offsetMs));
}

// ---------------------------------------------------------------- situação de quem deu lance
export type BidderStanding = "winning" | "outbid" | "won" | "lost" | "cancelled" | "watching";

/**
 * Situação da pessoa no item: vencendo / superado (ao vivo), arrematou / encerrado, cancelado,
 * ou só assistindo (nenhum lance).
 */
export function bidderStanding(input: {
  phase: CollectiblePhase;
  leadingBidId: string | null;
  myBidIds: ReadonlySet<string> | readonly string[];
  iWon?: boolean;
}): BidderStanding {
  const mine = input.myBidIds instanceof Set ? input.myBidIds : new Set(input.myBidIds as readonly string[]);
  if (input.phase === "cancelled") return mine.size > 0 ? "cancelled" : "watching";
  if (input.phase === "ended") {
    if (input.iWon || (input.leadingBidId !== null && mine.has(input.leadingBidId))) return "won";
    return mine.size > 0 ? "lost" : "watching";
  }
  if (mine.size === 0) return "watching";
  return input.leadingBidId !== null && mine.has(input.leadingBidId) ? "winning" : "outbid";
}

/** Códigos de erro do banco que a tela traduz (o resto vira "generic"). */
export const BID_ERROR_CODES = [
  "unauthenticated",
  "admin_cannot_bid",
  "account_suspended",
  "creator_cannot_bid",
  "not_found",
  "auction_ended",
  "auction_not_live",
  "invalid_increment",
  "already_winning",
  "rate_limited",
] as const;
export type BidErrorCode = (typeof BID_ERROR_CODES)[number] | "generic";

export function bidErrorCode(message: string | null | undefined): BidErrorCode {
  const text = message ?? "";
  return BID_ERROR_CODES.find((code) => text.includes(code)) ?? "generic";
}
