import type { ReactNode } from "react";
import { requireAgency } from "@/lib/agency/server";

// Financeiro: qualquer pessoa da agência entra (0139), mas a página só mostra ao gestor e à equipe a aba Projeção
// (somas, sem valor de negócio a negócio); lançamentos, notas e pagamentos da marca continuam só do Adm.
export default async function FinanceLayout({ children }: { children: ReactNode }) {
  await requireAgency("staff");
  return children;
}
