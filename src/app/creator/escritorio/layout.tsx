import { Briefcase } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { RouteTabs } from "@/components/agency/RouteTabs";
import { NotificationBell } from "@/components/inbox/NotificationBell";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { unreadInboxCount } from "@/lib/inbox/queries";
import { getTalentContext } from "@/lib/talent/server";

// Escritório do creator (6.4, web e app): só para quem está num casting. Tudo vem de
// talent_my_context() (o creator não lê talent_profiles). Abas por rota, mais o sino.
export default async function OfficeLayout({ children }: { children: ReactNode }) {
  const user = await requireUser("/creator/escritorio");
  const [ctx, t] = await Promise.all([getTalentContext(), getTranslations("talent")]);
  if (ctx.state !== "ok") {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid={ctx.state === "unavailable" ? "module-unavailable" : "office-none"}>
        <EmptyState icon={<Briefcase />} title={ctx.state === "unavailable" ? t("home.unavailable") : t("home.none")} description={ctx.state === "unavailable" ? undefined : t("home.noneHint")} />
      </div>
    );
  }
  const unread = await unreadInboxCount();
  return (
    <div className="flex flex-col gap-5" data-testid="office">
      <PageHeader
        eyebrow={t("meta.eyebrow")}
        title={ctx.talent.displayName}
        description={ctx.talent.manager ? t("home.agencyWithManager", { agency: ctx.talent.agency, manager: ctx.talent.manager }) : t("home.agency", { agency: ctx.talent.agency })}
        actions={unread !== null ? <NotificationBell userId={user.id} initialUnread={unread} allHref="/creator/escritorio/notificacoes" /> : null}
      />
      <RouteTabs
        label={t("tabs.label")}
        tabs={[
          { href: "/creator/escritorio", label: t("tabs.home"), exact: true },
          { href: "/creator/escritorio/oportunidades", label: t("tabs.opportunities") },
          { href: "/creator/escritorio/tarefas", label: t("tabs.tasks") },
          { href: "/creator/escritorio/agenda", label: t("tabs.agenda") },
          { href: "/creator/escritorio/disponibilidade", label: t("tabs.availability") },
          { href: "/creator/escritorio/media-kit", label: t("tabs.kit") },
          { href: "/creator/escritorio/consentimento", label: t("tabs.consent") },
          { href: "/creator/escritorio/notificacoes", label: t("tabs.notifications") },
        ]}
      />
      {children}
    </div>
  );
}
