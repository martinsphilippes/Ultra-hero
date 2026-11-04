import type { ReactNode } from "react";
import { NotificationBell } from "@/components/inbox/NotificationBell";
import { PortalShell } from "@/components/layout/PortalShell";
import { requireUser } from "@/lib/auth/session";
import { unreadInboxCount } from "@/lib/inbox/queries";

// Portal mínimo do staff externo (0110): fotógrafo, maquiador, músico… entram com a própria conta e veem só as salas dos
// projetos em que foram chamados (o banco decide, depois do NDA). Sem papel na plataforma: basta estar logado.
export default async function ProjectsLayout({ children }: { children: ReactNode }) {
  const user = await requireUser("/projetos");
  const unread = await unreadInboxCount();
  return (
    <PortalShell portal="project" headerAction={unread !== null ? <NotificationBell userId={user.id} initialUnread={unread} allHref="/projetos/avisos" /> : null}>
      {children}
    </PortalShell>
  );
}
