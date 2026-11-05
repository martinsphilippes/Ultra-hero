import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ModuleState } from "@/components/agency/ModuleState";
import { NotificationBell } from "@/components/inbox/NotificationBell";
import { PortalShell } from "@/components/layout/PortalShell";
import { brandNavKeys } from "@/lib/agency/roles";
import { getBrandContext } from "@/lib/brand-portal/server";
import { requireRole } from "@/lib/auth/session";
import { unreadInboxCount } from "@/lib/inbox/queries";
import { SeasonalTheme } from "@/components/seasonal-theme/SeasonalTheme";
import { WelcomeTourMount } from "@/components/welcome/WelcomeTourMount";

// Portal da marca (6.3, só web): papel no servidor (admin geral só lê), marca e agência que a atende.
export default async function BrandLayout({ children }: { children: ReactNode }) {
  const { user } = await requireRole("brand", "/marca");
  // tudo em paralelo (o contador de avisos não depende do contexto)
  const [ctx, t, unread] = await Promise.all([getBrandContext(), getTranslations("brandPortal"), unreadInboxCount()]);
  if (ctx.state !== "ok") {
    return (
      <PortalShell portal="brand" navKeys={["dashboard"]}>
        <ModuleState state={ctx.state} portal="brand" />
      </PortalShell>
    );
  }
  return (
    <PortalShell
      portal="brand"
      navKeys={brandNavKeys()}
      badge={ctx.brand.name}
      headerAction={unread !== null ? <NotificationBell userId={user.id} initialUnread={unread} allHref="/marca/notificacoes?aba=avisos" messages={{ portal: "brand", href: "/marca/notificacoes?aba=mensagens", initialUnread: 0 }} /> : null}
    >
      {ctx.platformAdmin && !ctx.role ? (
        <p className="mb-4 rounded-xl border border-dashed border-border-strong px-3 py-2 type-body-sm text-fg-muted">{t("adminReadOnly")}</p>
      ) : null}
      <SeasonalTheme area="portals" />
      {children}
      {/* boas-vindas do portal: só para quem é membro (o admin que só supervisiona não vê) */}
      {ctx.role ? <WelcomeTourMount area="marca" /> : null}
    </PortalShell>
  );
}
