import type { ReactNode } from "react";
import { HeroPendingNotice } from "@/components/creator/HeroPendingNotice";
import { ActingHeroBanner } from "@/components/admin-ops/ActingHeroBanner";
import { NotificationBell } from "@/components/inbox/NotificationBell";
import { PortalShell } from "@/components/layout/PortalShell";
import { heroPortalNavKeys } from "@/components/layout/portal-nav";
import { getActingHero } from "@/lib/acting-hero/server";
import { hasRole, requireRole } from "@/lib/auth/session";
import { hasHeroRole } from "@/lib/auth/talent-scope";
import { unreadInboxCount } from "@/lib/inbox/queries";
import { getTalentContext } from "@/lib/talent/server";
import { getMyCreator } from "./_lib/creator";
import { SeasonalTheme } from "@/components/seasonal-theme/SeasonalTheme";
import { WelcomeTourMount } from "@/components/welcome/WelcomeTourMount";

// Portal do Hero (0097): o "creator" era o próprio Hero, então a área do Hero (posts, conteúdos, receitas, equipe,
// agenda e financeiro próprios, 0091–0094) e o escritório do casting (oportunidades, tarefas, agenda e ganhos da
// agência, media kit, portfólio, documentos, consentimento, avisos, 0065/0087) viraram um portal só, com barra
// lateral no tablet/desktop, menu no celular, sino no topo e "Voltar ao app". Exige o papel de Hero (app_role
// 'creator'; o admin também passa). Os itens da agência só aparecem para quem está num casting; os de conteúdo, para
// quem tem Hero (titular ou membro). O admin segue com o menu dele no fluxo "Publicar como hero".
export default async function HeroPortalLayout({ children }: { children: ReactNode }) {
  const { user, roles } = await requireRole("creator", "/heroi");
  if (await hasRole("admin")) {
    const acting = await getActingHero();
    return (
      <PortalShell portal="admin">
        {acting.status === "ok" && <ActingHeroBanner hero={acting.hero} />}
        <SeasonalTheme area="portals" />
        {children}
      </PortalShell>
    );
  }
  const [talent, mine, unread] = await Promise.all([getTalentContext(), getMyCreator(), unreadInboxCount()]);
  const pendingHero = mine.creatorId !== null && mine.profile?.status === "pending";
  const navKeys = heroPortalNavKeys({ hero: hasHeroRole(roles), casting: talent.state === "ok" });
  return (
    <PortalShell portal="creator" navKeys={navKeys} headerAction={unread !== null ? <NotificationBell userId={user.id} initialUnread={unread} allHref="/heroi/avisos?aba=avisos" messages={{ portal: "hero", href: "/heroi/avisos?aba=mensagens", initialUnread: 0 }} /> : null}>
      {pendingHero ? (
        <div className="mb-4">
          <HeroPendingNotice />
        </div>
      ) : null}
      <SeasonalTheme area="portals" />
      {children}
      {/* boas-vindas do Portal do Hero (não no ramo do admin "Publicar como hero") */}
      <WelcomeTourMount area="heroi" />
    </PortalShell>
  );
}
