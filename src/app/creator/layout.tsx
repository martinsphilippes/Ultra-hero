import type { ReactNode } from "react";
import { ActingHeroBanner } from "@/components/admin-ops/ActingHeroBanner";
import { PortalShell } from "@/components/layout/PortalShell";
import { getActingHero } from "@/lib/acting-hero/server";
import { hasRole, requireRole } from "@/lib/auth/session";

// Portal da Personalidade: exige papel creator (admin também passa). O herói usa só o Novo post;
// o resto é do admin no fluxo "Publicar como hero" (cada tela confere), com a faixa do herói escolhido
// e o menu do admin.
export default async function CreatorLayout({ children }: { children: ReactNode }) {
  await requireRole("creator", "/creator");
  if (!(await hasRole("admin"))) return <PortalShell portal="creator">{children}</PortalShell>;
  const acting = await getActingHero();
  return (
    <PortalShell portal="admin">
      {acting.status === "ok" && <ActingHeroBanner hero={acting.hero} />}
      {children}
    </PortalShell>
  );
}
