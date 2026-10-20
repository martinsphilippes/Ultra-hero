import { Badge, type BadgeVariant } from "@/components/ui";

const VARIANTS: Record<string, BadgeVariant> = {
  // conteúdo / programas / produtos
  draft: "neutral",
  published: "success",
  archived: "warning",
  // revisão editorial
  none: "neutral",
  in_review: "info",
  returned: "warning",
  approved: "success",
  rejected: "danger",
  // parceiros / convites
  pending: "info",
  active: "success",
  suspended: "danger",
  accepted: "success",
  expired: "neutral",
  revoked: "danger",
  // moderação / vínculos
  clear: "success",
  hidden: "warning",
  suggested: "info",
  validated: "success",
  // disponibilidade
  available: "success",
  unavailable: "warning",
  // assinaturas / pedidos / remessas
  cancelled: "neutral",
  confirmed: "info",
  in_progress: "info",
  completed: "success",
  partially_completed: "warning",
  failed: "danger",
  awaiting: "neutral",
  preparing: "info",
  ready_for_dispatch: "accent",
  in_transit: "accent",
  delivered: "success",
  // feedback
  new: "info",
  reviewed: "success",
};

// Badge de status com cor consistente em todos os portais; o texto vem traduzido de quem usa.
export function StatusBadge({ status, label, size = "sm" }: { status: string; label?: string; size?: "sm" | "md" }) {
  return (
    <Badge variant={VARIANTS[status] ?? "neutral"} size={size}>
      {label ?? status.replaceAll("_", " ")}
    </Badge>
  );
}
