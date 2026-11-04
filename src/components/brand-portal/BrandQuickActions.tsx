"use client";

import { FolderKanban, Megaphone, Search, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui";

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
    <nav aria-label={t("shortcuts.label")} className="flex flex-col gap-2 sm:flex-row sm:items-stretch" data-testid="brand-quick-actions">
      {canPropose ? (
        <Button asChild block leadingIcon={<Megaphone />} className="sm:w-auto sm:shrink-0">
          <Link href={newProposalHref(day)} data-testid="brand-new-proposal">
            {t("newCampaign")}
          </Link>
        </Button>
      ) : null}
      <div className="grid grid-cols-3 gap-2 sm:flex">
        <Shortcut href="/marca/herois" icon={<Search />} label={t("shortcuts.heroes")} title={t("seeCreators")} />
        <Shortcut href="/marca/campanhas" icon={<FolderKanban />} label={t("shortcuts.campaigns")} title={t("seeCampaigns")} />
        <Shortcut href="/marca/equipe" icon={<Users />} label={t("shortcuts.team")} title={t("seeTeam")} />
      </div>
    </nav>
  );
}

function Shortcut({ href, icon, label, title }: { href: string; icon: ReactNode; label: string; title: string }) {
  return (
    <Link
      href={href}
      aria-label={title}
      className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface px-1 py-2 text-center text-xs sm:px-4 font-medium text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:bg-surface-hover sm:min-h-11 sm:flex-row sm:gap-2 sm:text-sm [&_svg]:size-5 [&_svg]:text-fg-muted sm:[&_svg]:size-4"
    >
      {icon}
      <span className="leading-tight">{label}</span>
    </Link>
  );
}
