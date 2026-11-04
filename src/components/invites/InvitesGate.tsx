import type { ReactNode } from "react";
import { getInvitesEnabled } from "@/lib/invitations/flag";
import { InvitesDisabledNote } from "./InvitesDisabledNote";

// Botões de CRIAR convite (0103): com "Convites ativos" desligado, o aviso curto fica no lugar. Revogar e aceitar
// convites já emitidos não passam por aqui (seguem valendo).
export async function InvitesGate({ children, className }: { children: ReactNode; className?: string }) {
  return (await getInvitesEnabled()) ? <>{children}</> : <InvitesDisabledNote className={className} />;
}
