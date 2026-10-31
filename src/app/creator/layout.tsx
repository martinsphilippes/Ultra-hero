import type { ReactNode } from "react";
import { ActingHeroBanner } from "@/components/admin-ops/ActingHeroBanner";
import { PortalShell } from "@/components/layout/PortalShell";
import { getActingHero } from "@/lib/acting-hero/server";
import { hasRole, isTalentOnly, requireRole } from "@/lib/auth/session";
import { getTalentContext } from "@/lib/talent/server";

// Portal da Personalidade: exige papel creator (admin também passa). O herói usa o Novo post e, se está
// num casting, o Escritório; o talento sem página pública (escopo talent, D2) só tem o Escritório.
// O resto é do admin no fluxo "Publicar como hero" (cada tela confere), com a faixa do herói escolhido
// e o menu do admin.
export default async function CreatorLayout({ children }: { children: ReactNode }) {
  const { roles } = await requireRole("creator", "/creator");
  if (!(await hasRole("admin"))) {
    const talent = await getTalentContext();
    const navKeys = isTalentOnly(roles) ? ["office"] : talent.state === "ok" ? ["post", "office"] : ["post"];
    return (
      <PortalShell portal="creator" navKeys={navKeys}>
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
