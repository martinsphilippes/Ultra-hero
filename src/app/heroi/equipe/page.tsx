import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { CreateMyHeroForm } from "@/components/invites/CreateMyHeroForm";
import { HeroTeamPanel } from "@/components/invites/HeroTeamPanel";
import { PageHeader } from "@/components/ui";
import { hasRole, requireRole } from "@/lib/auth/session";
import { parseHeroTeam, parseMyHero } from "@/lib/invitations/hero-team";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invites.team");
  return { title: t("title") };
}

// /heroi/equipe (0091): a equipe do herói da pessoa (titular gere; membro consulta). Sem herói: "Criar meu
// herói" (nasce pendente). O admin gere a equipe de qualquer herói pela ficha em /admin/herois.
export default async function HeroTeamPage() {
  await requireRole("creator", "/heroi/equipe");
  const [t, supabase, admin] = await Promise.all([getTranslations("invites.team"), createClient(), hasRole("admin")]);
  const { data: mine } = await supabase.rpc("my_hero_team");
  const hero = parseMyHero(mine);
  if (!hero) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} description={admin ? t("adminHint") : t("noHeroDescription")} />
        {admin ? null : <CreateMyHeroForm />}
      </div>
    );
  }
  const { data } = await supabase.rpc("hero_team_list", { p_creator: hero.creatorId });
  const team = parseHeroTeam(data);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={hero.name} title={t("title")} description={hero.role === "owner" ? t("ownerDescription") : t("memberDescription")} />
      {hero.status === "pending" ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-body-sm text-fg" data-testid="hero-pending">
          <Clock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {t("pendingApproval")}
        </p>
      ) : null}
      <HeroTeamPanel creatorId={hero.creatorId} heroName={hero.name} team={team} />
    </div>
  );
}
