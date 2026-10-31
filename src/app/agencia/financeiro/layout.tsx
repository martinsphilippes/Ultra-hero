import type { ReactNode } from "react";
import { requireAgency } from "@/lib/agency/server";

// Financeiro simulado: só o Adm da agência (e o admin da plataforma). Redireciona no servidor.
export default async function FinanceLayout({ children }: { children: ReactNode }) {
  await requireAgency("admin");
  return children;
}
