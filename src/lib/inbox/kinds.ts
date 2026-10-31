// Tipos de aviso do sino (0064, inbox_notifications.kind). Espelha o check da tabela e
// public.inbox_kind_pushes: só avisos do escritório do creator viram push (opt-in).
export const INBOX_KINDS = [
  "member_joined",
  "brand_member_joined",
  "talent_consent_given",
  "talent_consent_revoked",
  "briefing_received",
  "deal_assigned",
  "campaign_status_changed",
  "proposal_received",
  "proposal_decided",
  "message_received",
  "opportunity_received",
  "opportunity_updated",
  "opportunity_answered",
  "contract_acceptance_requested",
  "contract_confirmed",
  "task_assigned",
  "deliverable_submitted",
  "deliverable_decided",
  "deliverable_published",
  "talent_suggestion",
  "calendar_event_added",
  "commercial_date_published",
  "relationship_alert",
  "task_overdue",
  "payout_updated",
] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

const PUSH_KINDS: readonly InboxKind[] = [
  "message_received",
  "opportunity_received",
  "opportunity_updated",
  "contract_acceptance_requested",
  "contract_confirmed",
  "task_assigned",
  "deliverable_decided",
  "calendar_event_added",
  "task_overdue",
  "payout_updated",
];

export function isInboxKind(value: unknown): value is InboxKind {
  return typeof value === "string" && (INBOX_KINDS as readonly string[]).includes(value);
}

/** O aviso vira push? Só os tipos do escritório e só com link do escritório (mesma regra do banco). */
export function inboxKindPushes(kind: string, link: string): boolean {
  return (PUSH_KINDS as readonly string[]).includes(kind) && link.startsWith("/creator/escritorio");
}

/** Parâmetros do texto do aviso: só texto curto (nomes, datas, códigos). Valor nunca (D16). */
export function inboxParams(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number") out[key] = String(value).slice(0, 120);
  }
  return out;
}

/** Link interno seguro (o banco já confere o formato; aqui é a última barreira antes do <a>). */
export function safeInboxLink(link: unknown): string {
  return typeof link === "string" && /^\/[A-Za-z0-9/_?=&%#.-]*$/.test(link) && !link.startsWith("//") ? link : "/";
}
