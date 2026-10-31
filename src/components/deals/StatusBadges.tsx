import { useTranslations } from "next-intl";
import { Badge, type BadgeVariant } from "@/components/ui";
import type { BrandStatus, DealOutcome, DealStage } from "@/lib/deals/stages";
import { stageIndex } from "@/lib/deals/stages";
import type { DealTalentStatus, DeliverableStatus } from "@/lib/deals/vocab";

// Selos do núcleo comercial (etapa do negócio, situação vista pela marca, situação do creator no negócio,
// situação da entrega). Textos em commercial.*; nunca valores.

export function StageBadge({ stage, outcome, size = "sm" }: { stage: DealStage; outcome: DealOutcome | null; size?: "sm" | "md" }) {
  const t = useTranslations("commercial");
  const variant: BadgeVariant = stage === "closed" ? (outcome === "won" ? "success" : "neutral") : stageIndex(stage) >= 8 ? "success" : stageIndex(stage) >= 4 ? "info" : "accent";
  return (
    <Badge size={size} variant={variant} data-testid="stage-badge">
      {stage === "closed" && outcome ? t(`outcomes.${outcome}`) : t(`stages.${stage}`)}
    </Badge>
  );
}

export function BrandStatusBadge({ status, size = "sm" }: { status: BrandStatus; size?: "sm" | "md" }) {
  const t = useTranslations("commercial.brandStatus");
  const variant: BadgeVariant = status === "done" || status === "running" || status === "contracting" ? "success" : status === "cancelled" ? "neutral" : status === "draft" ? "neutral" : "info";
  return (
    <Badge size={size} variant={variant} data-testid="brand-status-badge">
      {t(status)}
    </Badge>
  );
}

export function TalentStatusBadge({ status, size = "sm" }: { status: DealTalentStatus; size?: "sm" | "md" }) {
  const t = useTranslations("commercial.talentStatus");
  const variant: BadgeVariant = status === "interested" || status === "proposed" || status === "contracted" ? "success" : status === "declined" || status === "removed" ? "neutral" : status === "consulted" || status === "talk_requested" ? "warning" : "accent";
  return (
    <Badge size={size} variant={variant} data-testid="talent-status-badge">
      {t(status)}
    </Badge>
  );
}

export function DeliverableStatusBadge({ status, size = "sm" }: { status: DeliverableStatus; size?: "sm" | "md" }) {
  const t = useTranslations("commercial.deliverableStatus");
  const variant: BadgeVariant = status === "approved" || status === "published" || status === "done" ? "success" : status === "changes_requested" ? "warning" : status === "cancelled" ? "neutral" : "info";
  return (
    <Badge size={size} variant={variant}>
      {t(status)}
    </Badge>
  );
}
