"use client";

import { Megaphone, Search, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui";

/** "Nova proposta" já com a data escolhida na agenda (?data=YYYY-MM-DD preenche o início do período). */
export function newProposalHref(day?: string | null): string {
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `/marca/campanhas/nova?data=${day}` : "/marca/campanhas/nova";
}

// Atalhos da marca (nova proposta, buscar heróis, campanhas, equipe). Ficam na Agenda: o trabalho da marca começa
// pelo calendário (pedido do responsável, 04/11). "Nova proposta" só para quem tem papel na marca e agência ligada e
// leva o dia selecionado na grade.
export function BrandQuickActions({ canPropose, day }: { canPropose: boolean; day?: string | null }) {
  const t = useTranslations("brandPortal.dashboard");
  return (
    <div className="flex flex-wrap gap-2" data-testid="brand-quick-actions">
      {canPropose ? (
        <Button asChild size="sm" leadingIcon={<Megaphone />}>
          <Link href={newProposalHref(day)} data-testid="brand-new-proposal">
            {t("newCampaign")}
          </Link>
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
