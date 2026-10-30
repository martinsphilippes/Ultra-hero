// Profissionais e serviços (Etapa 3, 0058). Regras puras (servidor, navegador e testes): listas
// fixas, situação do pedido (mesma regra de service_order_can no banco), preço, tempo de resposta,
// quem vê "Contratar" e a validação do contador de toques.

export const SPECIALTIES = ["nutritionist", "personal_trainer", "physiotherapist", "psychologist"] as const;
export type Specialty = (typeof SPECIALTIES)[number];

export const REGISTRY_TYPES = ["CRN", "CREF", "CREFITO", "CRP"] as const;
export type RegistryType = (typeof REGISTRY_TYPES)[number];

/** Conselho padrão de cada especialidade (o admin pode trocar). */
export const DEFAULT_REGISTRY: Record<Specialty, RegistryType> = {
  nutritionist: "CRN",
  personal_trainer: "CREF",
  physiotherapist: "CREFITO",
  psychologist: "CRP",
};

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
export type Uf = (typeof UFS)[number];

export const PROFESSIONAL_STATUSES = ["pending", "approved", "suspended"] as const;
export type ProfessionalStatus = (typeof PROFESSIONAL_STATUSES)[number];

export const SERVICE_KINDS = ["session", "plan"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];
export const SERVICE_MODES = ["online", "in_person", "both"] as const;
export type ServiceMode = (typeof SERVICE_MODES)[number];

export const MIN_PRICE_CENTS = 500;
export const MAX_PRICE_CENTS = 10_000_000;
export const MAX_SERVICES_PER_PROFESSIONAL = 12;
export const MAX_SERVICES_IN_CART = 10;

export function isSpecialty(value: unknown): value is Specialty {
  return typeof value === "string" && (SPECIALTIES as readonly string[]).includes(value);
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function isProfessionalSlug(value: unknown): value is string {
  return typeof value === "string" && value.length >= 3 && value.length <= 80 && SLUG.test(value);
}

// ---------------------------------------------------------------- situação do pedido
export const ORDER_STATUSES = ["pending", "accepted", "scheduled", "completed", "declined", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderActor = "professional" | "consumer" | "admin";

export const OPEN_STATUSES: readonly OrderStatus[] = ["pending", "accepted", "scheduled"];
export const CLOSED_STATUSES: readonly OrderStatus[] = ["completed", "declined", "cancelled"];

const TRANSITIONS: Record<OrderActor, ReadonlyArray<readonly [OrderStatus, OrderStatus]>> = {
  professional: [
    ["pending", "accepted"],
    ["pending", "declined"],
    ["accepted", "scheduled"],
    ["accepted", "completed"],
    ["accepted", "cancelled"],
    ["scheduled", "scheduled"],
    ["scheduled", "completed"],
    ["scheduled", "cancelled"],
  ],
  consumer: [["pending", "cancelled"]],
  admin: [
    ["pending", "cancelled"],
    ["accepted", "cancelled"],
    ["scheduled", "cancelled"],
  ],
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** O ator pode levar o pedido de `from` a `to`? (mesma tabela de service_order_can) */
export function canTransition(actor: OrderActor, from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[actor].some(([a, b]) => a === from && b === to);
}

/** Próximas situações possíveis, na ordem em que os botões aparecem. */
export function nextStatuses(actor: OrderActor, from: OrderStatus): OrderStatus[] {
  return TRANSITIONS[actor].filter(([a]) => a === from).map(([, b]) => b);
}

/** Tamanho mínimo do recado para a mudança (0 = opcional). */
export function minNoteLength(actor: OrderActor, to: OrderStatus): number {
  if (to === "scheduled") return 3;
  if ((actor === "professional" || actor === "admin") && (to === "declined" || to === "cancelled")) return 5;
  return 0;
}

export function isOpen(status: OrderStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

// ---------------------------------------------------------------- preço
export type PricedLine = { priceCents: number; quantity?: number };

/**
 * Totais do carrinho com serviços: frete só existe para produtos (sem destino = pendente). Serviço
 * não tem frete nem quantidade (1 de cada).
 */
export function cartTotals(input: { productSubtotalCents: number; shippingCents: number | null; services: PricedLine[]; hasProducts: boolean }) {
  const servicesCents = input.services.reduce((sum, s) => sum + s.priceCents * (s.quantity ?? 1), 0);
  const shipping = input.hasProducts ? input.shippingCents : 0;
  return {
    servicesCents,
    shippingCents: shipping,
    totalCents: shipping === null ? null : input.productSubtotalCents + shipping + servicesCents,
  };
}

/** Valida preço digitado ("180", "180,50", "1.234,00") e devolve centavos; inválido = null. */
export function parsePriceInput(raw: string): number | null {
  const clean = raw.trim().replace(/\s|R\$/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(clean)) return null;
  let normalized = clean;
  if (clean.includes(",")) normalized = clean.replace(/\./g, "").replace(",", ".");
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isFinite(cents) || cents < MIN_PRICE_CENTS || cents > MAX_PRICE_CENTS) return null;
  return cents;
}

// ---------------------------------------------------------------- formato do serviço
export type ServiceShape = { kind: ServiceKind; mode: ServiceMode; durationMinutes: number | null; planWeeks: number | null };

/** Chaves e valores para a linha "Online · 60 min" / "Plano de 4 semanas · Presencial". */
export function serviceFormatParts(s: ServiceShape): { mode: ServiceMode; minutes: number | null; weeks: number | null } {
  return { mode: s.mode, minutes: s.kind === "session" ? s.durationMinutes : null, weeks: s.kind === "plan" ? s.planWeeks : null };
}

/** Confere o formato antes de mandar ao banco (o banco confere de novo). */
export function validServiceShape(s: ServiceShape): boolean {
  if (!(SERVICE_KINDS as readonly string[]).includes(s.kind) || !(SERVICE_MODES as readonly string[]).includes(s.mode)) return false;
  if (s.kind === "session") return s.durationMinutes !== null && s.durationMinutes >= 15 && s.durationMinutes <= 480 && s.planWeeks === null;
  return s.planWeeks !== null && s.planWeeks >= 1 && s.planWeeks <= 52;
}

// ---------------------------------------------------------------- tempo de resposta
export type ResponseSample = { createdAt: string; firstResponseAt: string | null };

/** Mediana e média (minutos) do tempo até a 1ª resposta, e quantos ainda esperam. */
export function responseStats(rows: ResponseSample[], now: number = Date.now()) {
  const minutes = rows
    .filter((r) => r.firstResponseAt)
    .map((r) => (Date.parse(r.firstResponseAt as string) - Date.parse(r.createdAt)) / 60000)
    .filter((m) => Number.isFinite(m) && m >= 0)
    .sort((a, b) => a - b);
  const waiting = rows.filter((r) => !r.firstResponseAt);
  const oldestWaitingMinutes = waiting.length
    ? Math.max(...waiting.map((r) => (now - Date.parse(r.createdAt)) / 60000).filter((m) => Number.isFinite(m)))
    : null;
  const median = minutes.length === 0 ? null : minutes.length % 2 ? minutes[(minutes.length - 1) / 2] : (minutes[minutes.length / 2 - 1] + minutes[minutes.length / 2]) / 2;
  const average = minutes.length === 0 ? null : minutes.reduce((a, b) => a + b, 0) / minutes.length;
  return { answered: minutes.length, waiting: waiting.length, medianMinutes: median, averageMinutes: average, oldestWaitingMinutes };
}

/** "45 min", "3 h", "2 d" — unidade e valor para a tradução escolher a frase. */
export function durationParts(minutes: number): { unit: "min" | "h" | "d"; value: number } {
  if (minutes < 60) return { unit: "min", value: Math.max(1, Math.round(minutes)) };
  if (minutes < 60 * 48) return { unit: "h", value: Math.round(minutes / 60) };
  return { unit: "d", value: Math.round(minutes / (60 * 24)) };
}

// ---------------------------------------------------------------- quem vê "Contratar"
export type HireContext = {
  /** App das lojas: comércio simulado oculto (docs/decisions/app-nas-lojas.md). */
  nativeApp: boolean;
  commerceEnabled: boolean;
  loggedIn: boolean;
  /** O próprio profissional olhando o próprio serviço. */
  ownService: boolean;
};

export type HireAction = "hire" | "login" | "own" | "none";

/** O que aparece no lugar do botão Contratar. No app das lojas: nada (o perfil continua visível). */
export function hireAction(ctx: HireContext): HireAction {
  if (ctx.nativeApp || !ctx.commerceEnabled) return "none";
  if (!ctx.loggedIn) return "login";
  if (ctx.ownService) return "own";
  return "hire";
}

/**
 * Nutricionistas sugeridos para uma receita: os ligados à receita, depois os do herói da vitrine,
 * depois qualquer nutricionista aprovado (fallback). Sem repetição, até `limit`.
 */
export function pickSuggested<T extends { id: string }>(groups: { recipe: T[]; hero: T[]; any: T[] }, limit = 3): { items: T[]; source: "recipe" | "hero" | "any" | null } {
  const seen = new Set<string>();
  const items: T[] = [];
  let source: "recipe" | "hero" | "any" | null = null;
  for (const key of ["recipe", "hero", "any"] as const) {
    for (const item of groups[key]) {
      if (items.length >= limit) break;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
      source ??= key;
    }
  }
  return { items, source };
}

// ---------------------------------------------------------------- contador de toques
export const TAP_SOURCES = ["receita", "alimentacao", "perfil", "lista", "programa"] as const;
export type TapSource = (typeof TAP_SOURCES)[number];
export const TAP_ACTIONS = ["ver_perfil", "contratar"] as const;
export type TapAction = (typeof TAP_ACTIONS)[number];

/** O que o navegador manda (sem nada da pessoa). */
export type ProfessionalTap = { professionalId: string; creatorId: string | null; source: TapSource; action: TapAction };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function parseProfessionalTap(input: unknown): ProfessionalTap | null {
  if (typeof input !== "object" || input === null) return null;
  const { professionalId, creatorId, source, action } = input as Record<string, unknown>;
  if (typeof professionalId !== "string" || !UUID.test(professionalId)) return null;
  if (creatorId !== null && creatorId !== undefined && (typeof creatorId !== "string" || !UUID.test(creatorId))) return null;
  if (typeof source !== "string" || !(TAP_SOURCES as readonly string[]).includes(source)) return null;
  if (typeof action !== "string" || !(TAP_ACTIONS as readonly string[]).includes(action)) return null;
  return {
    professionalId: professionalId.toLowerCase(),
    creatorId: typeof creatorId === "string" ? creatorId.toLowerCase() : null,
    source: source as TapSource,
    action: action as TapAction,
  };
}

/** Iniciais para o avatar sem foto. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}
