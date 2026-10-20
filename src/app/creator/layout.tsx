import type { ReactNode } from "react";
import { PortalShell } from "@/components/layout/PortalShell";
import { requireRole } from "@/lib/auth/session";

// Portal da Personalidade: exige papel creator (admin também passa).
export default async function CreatorLayout({ children }: { children: ReactNode }) {
  await requireRole("creator", "/creator");
  return <PortalShell portal="creator">{children}</PortalShell>;
}
