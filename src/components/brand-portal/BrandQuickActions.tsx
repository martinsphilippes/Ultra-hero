import { Megaphone, Search, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button } from "@/components/ui";

// Atalhos da marca (nova proposta, buscar heróis, campanhas, equipe). Ficam na Agenda: o trabalho da marca começa
// pelo calendário (pedido do responsável, 04/11). "Nova proposta" só para quem tem papel na marca e agência ligada.
export async function BrandQuickActions({ canPropose }: { canPropose: boolean }) {
  const t = await getTranslations("brandPortal.dashboard");
  return (
    <div className="flex flex-wrap gap-2" data-testid="brand-quick-actions">
      {canPropose ? (
        <Button asChild size="sm" leadingIcon={<Megaphone />}>
          <Link href="/marca/campanhas/nova">{t("newCampaign")}</Link>
        </Button>
      ) : null}
      <Button asChild size="sm" variant="secondary" leadingIcon={<Search />}>
        <Link href="/marca/herois">{t("seeCreators")}</Link>
      </Button>
      <Button asChild size="sm" variant="secondary">
        <Link href="/marca/campanhas">{t("seeCampaigns")}</Link>
      </Button>
      <Button asChild size="sm" variant="secondary" leadingIcon={<Users />}>
        <Link href="/marca/equipe">{t("seeTeam")}</Link>
      </Button>
    </div>
  );
}
