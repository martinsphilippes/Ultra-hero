import { Briefcase } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { NotificationBell } from "@/components/inbox/NotificationBell";
import { PortalShell } from "@/components/layout/PortalShell";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { unreadInboxCount } from "@/lib/inbox/queries";
import { getTalentContext } from "@/lib/talent/server";

// Portal do creator (6.4 + 0087, web e app): o escritório é um portal como agência e marca — barra
// lateral no tablet/desktop, menu no celular, sino no topo e "Voltar ao app". Só para quem está num
// casting (login próprio ou dono do herói ligado). Tudo vem de talent_my_context() (o creator não lê
// talent_profiles). As rotas são as mesmas das abas de antes (portal-nav.ts, PORTAL_LINKS.office).
export default async function OfficeLayout({ children }: { children: ReactNode }) {
  const user = await requireUser("/creator/escritorio");
  const [ctx, t] = await Promise.all([getTalentContext(), getTranslations("talent")]);
  if (ctx.state !== "ok") {
    return (
      <PortalShell portal="office" navKeys={["dashboard"]}>
        <div className="rounded-2xl border border-border bg-surface" data-testid={ctx.state === "unavailable" ? "module-unavailable" : "office-none"}>
          <EmptyState icon={<Briefcase />} title={ctx.state === "unavailable" ? t("home.unavailable") : t("home.none")} description={ctx.state === "unavailable" ? undefined : t("home.noneHint")} />
        </div>
      </PortalShell>
    );
  }
  const unread = await unreadInboxCount();
  return (
    <PortalShell portal="office" headerAction={unread !== null ? <NotificationBell userId={user.id} initialUnread={unread} allHref="/creator/escritorio/notificacoes" /> : null}>
      <div className="flex flex-col gap-5" data-testid="office">
        <PageHeader
          eyebrow={t("meta.eyebrow")}
          title={ctx.talent.displayName}
          description={ctx.talent.manager ? t("home.agencyWithManager", { agency: ctx.talent.agency, manager: ctx.talent.manager }) : t("home.agency", { agency: ctx.talent.agency })}
        />
        {children}
      </div>
    </PortalShell>
  );
}
