import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ModuleState } from "@/components/agency/ModuleState";
import { NotificationBell } from "@/components/inbox/NotificationBell";
import { PortalShell } from "@/components/layout/PortalShell";
import { brandNavKeys } from "@/lib/agency/roles";
import { getBrandContext } from "@/lib/brand-portal/server";
import { requireRole } from "@/lib/auth/session";
import { unreadInboxCount } from "@/lib/inbox/queries";

// Portal da marca (6.3, só web): papel no servidor (admin geral só lê), marca e agência que a atende.
export default async function BrandLayout({ children }: { children: ReactNode }) {
  const { user } = await requireRole("brand", "/marca");
  const [ctx, t] = await Promise.all([getBrandContext(), getTranslations("brandPortal")]);
  if (ctx.state !== "ok") {
    return (
      <PortalShell portal="brand" navKeys={["dashboard"]}>
        <ModuleState state={ctx.state} portal="brand" />
      </PortalShell>
    );
  }
  const unread = await unreadInboxCount();
  return (
    <PortalShell
      portal="brand"
      navKeys={brandNavKeys()}
      badge={ctx.brand.name}
      headerAction={unread !== null ? <NotificationBell userId={user.id} initialUnread={unread} allHref="/marca/notificacoes" /> : null}
    >
      {ctx.platformAdmin && !ctx.role ? (
        <p className="mb-4 rounded-xl border border-dashed border-border-strong px-3 py-2 type-body-sm text-fg-muted">{t("adminReadOnly")}</p>
      ) : null}
      {children}
    </PortalShell>
  );
}
