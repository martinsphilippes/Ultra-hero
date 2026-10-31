import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import type { Availability, CommercialStatus } from "@/lib/talent/vocab";

type Props = { status: CommercialStatus; availability: Availability; consent: "active" | "revoked" | "none"; catalogVisible: boolean; archived?: boolean };

// Selos da ficha e da lista do casting (situação, disponibilidade, consentimento, catálogo).
export function TalentStatusBadges({ status, availability, consent, catalogVisible, archived }: Props) {
  const t = useTranslations("agency.casting");
  return (
    <span className="flex flex-wrap gap-1.5">
      {archived ? <Badge size="sm">{t("archivedTag")}</Badge> : null}
      <Badge size="sm" variant={status === "active" ? "success" : "neutral"}>
        {t(`status.${status}`)}
      </Badge>
      <Badge size="sm" variant={availability === "available" ? "success" : availability === "limited" ? "warning" : "neutral"}>
        {t(`availability.${availability}`)}
      </Badge>
      <Badge size="sm" variant={consent === "active" ? "info" : "neutral"} data-testid="talent-consent-badge">
        {t(`consentState.${consent}`)}
      </Badge>
      {catalogVisible ? <Badge size="sm" variant="info">{t("inCatalog")}</Badge> : null}
    </span>
  );
}
