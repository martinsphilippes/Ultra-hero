import type { ReactNode } from "react";
import { HeroPendingNotice } from "@/components/creator/HeroPendingNotice";
import { ActingHeroBanner } from "@/components/admin-ops/ActingHeroBanner";
import { PortalShell } from "@/components/layout/PortalShell";
import { getActingHero } from "@/lib/acting-hero/server";
import { hasRole, isTalentOnly, requireRole } from "@/lib/auth/session";
import { getTalentContext } from "@/lib/talent/server";
import { getMyCreator } from "./_lib/creator";

// Área do herói (grupo (hero), 0087): exige papel creator (admin também passa). O herói usa o Novo post, o Novo
// conteúdo e Meus conteúdos (0092: estruturado e receitas pelo próprio portal) e, se está num casting, o Escritório; o talento sem página pública (escopo talent, D2) só tem o Escritório.
// O resto é do admin no fluxo "Publicar como hero" (cada tela confere), com a faixa do herói escolhido
// e o menu do admin.
export default async function CreatorLayout({ children }: { children: ReactNode }) {
  const { roles } = await requireRole("creator", "/creator");
  if (!(await hasRole("admin"))) {
    const [talent, mine] = await Promise.all([getTalentContext(), getMyCreator()]);
    const pendingHero = mine.creatorId !== null && mine.profile?.status === "pending";
    // 0091: Equipe do herói (titular, membros; sem herói, "Criar meu herói") para todo creator
    // 0092: Novo conteúdo e Meus conteúdos para quem tem herói (o talento sem página não tem)
    const navKeys = isTalentOnly(roles) ? ["office", "team"] : talent.state === "ok" ? ["post", "newContent", "content", "office", "team"] : ["post", "newContent", "content", "team"];
    return (
      <PortalShell portal="creator" navKeys={navKeys}>
        {pendingHero ? (
          <div className="mb-4">
            <HeroPendingNotice />
          </div>
        ) : null}
        {children}
      </PortalShell>
    );
  }
  const acting = await getActingHero();
  return (
    <PortalShell portal="admin">
      {acting.status === "ok" && <ActingHeroBanner hero={acting.hero} />}
      {children}
    </PortalShell>
  );
}
