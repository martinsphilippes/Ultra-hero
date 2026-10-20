import type { ReactNode } from "react";
import { PortalShell } from "@/components/layout/PortalShell";
import { requireRole } from "@/lib/auth/session";

// Portal Admin: gate de papel no servidor (o middleware só exige sessão).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole("admin", "/admin");
  return <PortalShell portal="admin">{children}</PortalShell>;
}
