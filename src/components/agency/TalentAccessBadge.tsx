import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import { talentAccessVariant, type TalentAccess } from "@/lib/talent/access";

// Selo do acesso do creator ao escritório (0087): "Com login", "Convite pendente", "Sem login".
export function TalentAccessBadge({ access }: { access: TalentAccess | null }) {
  const t = useTranslations("agency.casting.access");
  if (!access) return null;
  return (
    <Badge size="sm" variant={talentAccessVariant(access)} data-testid="talent-access-badge" data-access={access}>
      {t(access)}
    </Badge>
  );
}
