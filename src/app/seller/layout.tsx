import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { SellerPortalClosed } from "@/components/commerce/seller/SellerPortalClosed";
import { PortalShell } from "@/components/layout/PortalShell";
import { getRoles, requireRole, requireUser } from "@/lib/auth/session";
import { sellerPortalAccess } from "@/lib/seller-ops/portal";

// Portal do Fornecedor: desligado por enquanto (SELLER_PORTAL_ENABLED). Com ele desligado, o admin vai
// à operação dos fornecedores no admin e qualquer outra conta vê um aviso curto (sem telas nem ações).
// Ligado de novo, volta a exigir papel seller (admin também passa).
export default async function SellerLayout({ children }: { children: ReactNode }) {
  await requireUser("/seller");
  const roles = await getRoles();
  const access = sellerPortalAccess(roles.some((r) => r.role === "admin"));
  if (access === "admin") redirect("/admin/sellers");
  if (access === "closed") return <SellerPortalClosed />;
  await requireRole("seller", "/seller");
  return <PortalShell portal="seller">{children}</PortalShell>;
}
