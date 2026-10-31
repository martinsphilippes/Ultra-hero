import type { ReactNode } from "react";
import { requireAgency } from "@/lib/agency/server";

// Histórico (auditoria da agência): só o Adm. Redireciona no servidor.
export default async function HistoryLayout({ children }: { children: ReactNode }) {
  await requireAgency("admin");
  return children;
}
