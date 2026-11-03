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
  // aprovação interna e pré-seleção da marca (0081)
  "internal_approval_requested",
  "internal_approval_decided",
  "shortlist_sent",
  "shortlist_decided",
  // verba, nota fiscal e pagamento (0082)
  "invoice_submitted",
  "invoice_reviewed",
  "payout_scheduled",
  "budget_exceeded",
  // biblioteca (vencimento do direito de uso) e comentário no segundo (0083)
  "usage_rights_expiring",
  "deliverable_comment",
  // prazo de tarefa chegando em 24 h, pelo cron (0084)
  "task_due_soon",
  // oportunidade de patrocínio (0085): nova para as marcas, interesse para a agência, decisão para marcas e creator
  "sponsorship_published",
  "sponsorship_interest",
  "sponsorship_decided",
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

/**
 * O aviso também vai por e-mail? Espelha public.inbox_kind_emails (0084): oferta nova e ajuste pedido para o
 * influenciador, contraproposta respondida, entrega aguardando a marca, termos para assinar e prazo em 24 h.
 * 0085: oportunidade de patrocínio nova (marca), interesse recebido (agência) e decisão (marcas e creator).
 */
export function inboxKindEmails(kind: string, link: string, params: Record<string, unknown> = {}): boolean {
  const status = typeof params.status === "string" ? params.status : "";
  const office = link.startsWith("/creator/escritorio");
  switch (kind) {
    case "opportunity_received":
      return office;
    case "opportunity_updated":
      return office && (status === "counter_accepted" || status === "counter_rejected");
    case "deliverable_decided":
      return office && status === "changes_requested";
    case "deliverable_submitted":
      return link.startsWith("/marca/");
    case "contract_acceptance_requested":
    case "task_due_soon":
    case "sponsorship_decided":
      return true;
    case "sponsorship_published":
      return link.startsWith("/marca/");
    case "sponsorship_interest":
      return link.startsWith("/agencia/");
    default:
      return false;
  }
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
