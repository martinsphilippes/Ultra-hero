"use client";

import { FolderKanban, Megaphone, Search, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { QuickActions } from "@/components/ui";

/** "Nova proposta" já com a data escolhida na agenda (?data=YYYY-MM-DD preenche o início do período). */
export function newProposalHref(day?: string | null): string {
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `/marca/campanhas/nova?data=${day}` : "/marca/campanhas/nova";
}

// Atalhos da marca na Agenda (o trabalho da marca começa pelo calendário, pedido do responsável 04/11).
// Celular: "Nova proposta" em largura total (ação principal, leva o dia selecionado na grade) e, embaixo, três atalhos
// compactos do mesmo tamanho (ícone + rótulo curto), alvos de toque de 64px. Telas largas: tudo numa linha só.
// "Nova proposta" só para quem tem papel na marca e agência ligada.
export function BrandQuickActions({ canPropose, day }: { canPropose: boolean; day?: string | null }) {
  const t = useTranslations("brandPortal.dashboard");
  return (
    <QuickActions
      label={t("shortcuts.label")}
      testId="brand-quick-actions"
      primary={canPropose ? { href: newProposalHref(day), icon: <Megaphone />, label: t("newCampaign"), testId: "brand-new-proposal" } : null}
      items={[
        { href: "/marca/herois", icon: <Search />, label: t("shortcuts.heroes"), title: t("seeCreators") },
        { href: "/marca/campanhas", icon: <FolderKanban />, label: t("shortcuts.campaigns"), title: t("seeCampaigns") },
        { href: "/marca/equipe", icon: <Users />, label: t("shortcuts.team"), title: t("seeTeam") },
      ]}
    />
  );
}
