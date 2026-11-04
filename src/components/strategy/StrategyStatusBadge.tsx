import { useTranslations } from "next-intl";
import { Badge, type BadgeVariant } from "@/components/ui";
import type { StrategyStatus } from "@/lib/strategy/vocab";

const VARIANT: Record<StrategyStatus, BadgeVariant> = { idea: "neutral", review: "warning", approved: "info", ready: "accent", sent: "success" };

export function StrategyStatusBadge({ status }: { status: StrategyStatus }) {
  const t = useTranslations("strategy.status");
  return (
    <Badge size="sm" variant={VARIANT[status]} data-testid="strategy-status" data-status={status}>
      {t(status)}
    </Badge>
  );
}
