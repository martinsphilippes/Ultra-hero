import type { ReactNode } from "react";
import { PortalShell } from "@/components/layout/PortalShell";
import { requireRole } from "@/lib/auth/session";

// Portal do Fornecedor: exige papel seller (admin também passa).
export default async function SellerLayout({ children }: { children: ReactNode }) {
  await requireRole("seller", "/seller");
  return <PortalShell portal="seller">{children}</PortalShell>;
}
