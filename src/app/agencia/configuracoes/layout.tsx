import type { ReactNode } from "react";
import { requireAgency } from "@/lib/agency/server";

// Configurações: gestor ou Adm (o colaborador volta ao Início, no servidor).
export default async function AgencySettingsLayout({ children }: { children: ReactNode }) {
  await requireAgency("manager");
  return children;
}
