import type { ReactNode } from "react";
import { requireAgency } from "@/lib/agency/server";

// Equipe: só o Adm da agência (e o admin geral). Os demais voltam ao Início, no servidor.
export default async function TeamLayout({ children }: { children: ReactNode }) {
  await requireAgency("admin");
  return children;
}
