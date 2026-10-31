import type { ReactNode } from "react";
import { requireAgency } from "@/lib/agency/server";

// Novo talento: gestor+ (o colaborador consulta o casting e volta ao Início, no servidor).
export default async function NewTalentLayout({ children }: { children: ReactNode }) {
  await requireAgency("manager");
  return children;
}
