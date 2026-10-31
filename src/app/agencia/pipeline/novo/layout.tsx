import type { ReactNode } from "react";
import { requireAgency } from "@/lib/agency/server";

// Novo negócio: só gestor+ (o colaborador recebe negócios atribuídos). Redireciona no servidor.
export default async function NewDealLayout({ children }: { children: ReactNode }) {
  await requireAgency("manager");
  return children;
}
