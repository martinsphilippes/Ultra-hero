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

// Portal do Herói (0097): o "creator" era o próprio herói, então a área do herói (posts, conteúdos, receitas, equipe,
// agenda e financeiro próprios, 0091–0094) e o escritório do casting (oportunidades, tarefas, agenda e ganhos da
// agência, media kit, portfólio, documentos, consentimento, avisos, 0065/0087) viraram um portal só, com barra
// lateral no tablet/desktop, menu no celular, sino no topo e "Voltar ao app". Exige o papel de herói (app_role
// 'creator'; o admin também passa). Os itens da agência só aparecem para quem está num casting; os de conteúdo, para
// quem tem herói (titular ou membro). O admin segue com o menu dele no fluxo "Publicar como hero".
export default async function HeroPortalLayout({ children }: { children: ReactNode }) {
  const { user, roles } = await requireRole("creator", "/heroi");
  if (await hasRole("admin")) {
    const acting = await getActingHero();
    return (
      <PortalShell portal="admin">
        {acting.status === "ok" && <ActingHeroBanner hero={acting.hero} />}
        {children}
      </PortalShell>
    );
  }
  const [talent, mine, unread] = await Promise.all([getTalentContext(), getMyCreator(), unreadInboxCount()]);
  const pendingHero = mine.creatorId !== null && mine.profile?.status === "pending";
  const navKeys = heroPortalNavKeys({ hero: hasHeroRole(roles), casting: talent.state === "ok" });
  return (
    <PortalShell portal="creator" navKeys={navKeys} headerAction={unread !== null ? <NotificationBell userId={user.id} initialUnread={unread} allHref="/heroi/avisos" /> : null}>
      {pendingHero ? (
        <div className="mb-4">
          <HeroPendingNotice />
        </div>
      ) : null}
      {children}
    </PortalShell>
  );
}
