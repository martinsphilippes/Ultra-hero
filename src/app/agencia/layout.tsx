import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ModuleState } from "@/components/agency/ModuleState";
import { NotificationBell } from "@/components/inbox/NotificationBell";
import { PortalShell } from "@/components/layout/PortalShell";
import { Badge } from "@/components/ui";
import { agencyNavKeys } from "@/lib/agency/roles";
import { getAgencyContext } from "@/lib/agency/server";
import { requireRole } from "@/lib/auth/session";
import { unreadInboxCount } from "@/lib/inbox/queries";

// Portal da agência (6.2, só web): papel no servidor (admin geral também passa), menu pelo nível
// (Adm > Gestor > Colaborador) e o sino. Sem loading.tsx na raiz: os layouts de segmento restrito
// redirecionam no servidor (6.1).
export default async function AgencyLayout({ children }: { children: ReactNode }) {
  const { user } = await requireRole("agency", "/agencia");
  const [ctx, t] = await Promise.all([getAgencyContext(), getTranslations("agency")]);
  if (ctx.state !== "ok") {
    return (
      <PortalShell portal="agency" navKeys={["dashboard"]}>
        <ModuleState state={ctx.state} portal="agency" />
      </PortalShell>
    );
  }
  const unread = await unreadInboxCount();
  return (
    <PortalShell
      portal="agency"
      navKeys={agencyNavKeys(ctx.role, ctx.platformAdmin)}
      headerAction={unread !== null ? <NotificationBell userId={user.id} initialUnread={unread} allHref="/agencia/notificacoes" /> : null}
    >
      {ctx.agency.isDemo ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-warning/40 bg-warning-soft/40 px-3 py-2 type-body-sm text-fg-muted" data-testid="agency-demo-banner">
          <Badge variant="demo" size="sm">
            {t("demoBanner.tag")}
          </Badge>
          {t("demoBanner.text")}
        </p>
      ) : null}
      {children}
    </PortalShell>
  );
}
