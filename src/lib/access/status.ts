// Situação do cadastro e fila da Presidência (0141). Módulo puro: interpreta o que as RPCs devolvem.
import type { BusinessProfile } from "@/lib/auth/profile-signup";
import type { AccessStatus } from "./gate";

export const REQUESTED_PROFILES = ["consumer", "hero", "brand", "agency", "professional", "seller", "staff", "admin"] as const;
export type RequestedProfile = (typeof REQUESTED_PROFILES)[number];

export const ACCESS_ORIGINS = ["password", "quick", "google", "apple", "invite", "admin", "legacy", "other"] as const;
export type AccessOrigin = (typeof ACCESS_ORIGINS)[number];

/** Perfis que a própria pessoa escolhe enquanto espera (entrou com Google/Apple sem escolher). */
export const CHOOSABLE_PROFILES = ["consumer", "hero", "brand", "agency"] as const;
export type ChoosableProfile = (typeof CHOOSABLE_PROFILES)[number];

export type AccountAccess = {
  status: AccessStatus;
  requestedProfile: RequestedProfile;
  profileConfirmed: boolean;
  origin: AccessOrigin;
  requestedAt: string | null;
  decidedAt: string | null;
  appOnly: boolean;
  email: string | null;
  name: string | null;
};

export type QueueItem = {
  userId: string;
  email: string | null;
  name: string | null;
  requestedProfile: RequestedProfile;
  profileConfirmed: boolean;
  origin: AccessOrigin;
  requestedAt: string | null;
  status: AccessStatus;
  decidedAt: string | null;
  decisionNote: string | null;
  decidedByName: string | null;
  /** posse do e-mail comprovada (Google/Apple ou recuperação de senha); senha e cadastro rápido não comprovam */
  emailVerified: boolean;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

const STATUSES = ["pending", "approved", "rejected"] as const;

/** account_access_status() → objeto tipado; nulo quando a resposta não tem a forma esperada. */
export function parseAccountAccess(data: unknown): AccountAccess | null {
  const r = record(data);
  if (!r || typeof r.status !== "string" || !(STATUSES as readonly string[]).includes(r.status)) return null;
  return {
    status: r.status as AccessStatus,
    requestedProfile: pick(r.requested_profile, REQUESTED_PROFILES, "consumer"),
    profileConfirmed: r.profile_confirmed !== false,
    origin: pick(r.origin, ACCESS_ORIGINS, "other"),
    requestedAt: str(r.requested_at),
    decidedAt: str(r.decided_at),
    appOnly: r.app_only === true,
    email: str(r.email),
    name: str(r.name),
  };
}

/** presidency_access_queue() → itens válidos (linhas sem id são descartadas). */
export function parseQueue(data: unknown): QueueItem[] {
  if (!Array.isArray(data)) return [];
  const items: QueueItem[] = [];
  for (const row of data) {
    const r = record(row);
    const userId = str(r?.user_id);
    if (!r || !userId) continue;
    items.push({
      userId,
      email: str(r.email),
      name: str(r.name),
      requestedProfile: pick(r.requested_profile, REQUESTED_PROFILES, "consumer"),
      profileConfirmed: r.profile_confirmed !== false,
      origin: pick(r.origin, ACCESS_ORIGINS, "other"),
      requestedAt: str(r.requested_at),
      status: pick(r.status, STATUSES, "pending"),
      decidedAt: str(r.decided_at),
      decisionNote: str(r.decision_note),
      decidedByName: str(r.decided_by_name),
      emailVerified: r.email_verified === true,
    });
  }
  return items;
}

// already_decided (0144): outro aprovador decidiu enquanto a tela estava aberta (vale a primeira decisão)
export const PRESIDENCY_ERRORS = ["forbidden", "already_approved", "already_decided", "not_found", "cannot_decide_self", "profile_changed", "invalid_input"] as const;
export type PresidencyError = (typeof PRESIDENCY_ERRORS)[number] | "unknown";

/** Mensagem do banco → chave de tradução (access.queue.errors.*). */
export function presidencyError(message: string | null | undefined): PresidencyError {
  const m = message ?? "";
  return PRESIDENCY_ERRORS.find((code) => m.includes(code)) ?? "unknown";
}

/** Depois da aprovação: perfil de negócio pedido → passo a passo dele (Hero só no app, conferido por quem chama). */
export function onboardingKindAfterApproval(profile: RequestedProfile): BusinessProfile | null {
  return profile === "hero" || profile === "brand" || profile === "agency" ? profile : null;
}

/** /comecar/<slug> → perfil pedido (volta do Google com o perfil escolhido na entrada). */
export function profileFromStartPath(path: string): ChoosableProfile | null {
  const match = /^\/comecar\/(heroi|marca|agencia)(?:[/?#]|$)/.exec(path);
  if (!match) return null;
  return match[1] === "heroi" ? "hero" : match[1] === "marca" ? "brand" : "agency";
}
