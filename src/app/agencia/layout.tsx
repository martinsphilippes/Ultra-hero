import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ModuleState } from "@/components/agency/ModuleState";
import { NotificationBell } from "@/components/inbox/NotificationBell";
import { PortalShell } from "@/components/layout/PortalShell";
import { Badge } from "@/components/ui";
import { agencyNavKeys } from "@/lib/agency/roles";
import { getAgencyContext } from "@/lib/agency/server";
import { isPresidency } from "@/lib/access/presidency";
import { requireRole } from "@/lib/auth/session";
import { unreadInboxCount } from "@/lib/inbox/queries";
import { SeasonalTheme } from "@/components/seasonal-theme/SeasonalTheme";
import { WelcomeTourMount } from "@/components/welcome/WelcomeTourMount";
import { MemberProfileForm } from "@/components/team/MemberProfileForm";
import { memberProfileComplete } from "@/lib/team/levels";

// Portal da agência (6.2, só web): papel no servidor (admin geral também passa), menu pelo nível
// (Adm > Gestor > Colaborador) e o sino. Com loading.tsx na raiz (velocidade: o toque troca a tela na hora); os
// layouts de segmento restrito continuam redirecionando no servidor (6.1).
export default async function AgencyLayout({ children }: { children: ReactNode }) {
  const { user } = await requireRole("agency", "/agencia");
  // tudo em paralelo (o contador de avisos não depende do contexto): uma ida ao banco a menos em cada tela
  const [ctx, t, tg, unread, presidency] = await Promise.all([getAgencyContext(), getTranslations("agency"), getTranslations("team.gate"), unreadInboxCount(), isPresidency()]);
  if (ctx.state !== "ok") {
    return (
      <PortalShell portal="agency" navKeys={["dashboard"]}>
        <ModuleState state={ctx.state} portal="agency" />
      </PortalShell>
    );
  }
  return (
    <PortalShell
      portal="agency"
      navKeys={agencyNavKeys(ctx.role, ctx.platformAdmin, { groscove: ctx.agency.slug === "groscove", presidency })}
      headerAction={unread !== null ? <NotificationBell userId={user.id} initialUnread={unread} allHref="/agencia/notificacoes?aba=avisos" messages={{ portal: "agency", href: "/agencia/notificacoes?aba=mensagens", initialUnread: 0 }} /> : null}
    >
      {ctx.agency.isDemo ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 type-body-sm text-fg-muted" data-testid="agency-demo-banner">
          <Badge variant="neutral" size="sm">
            {t("demoBanner.tag")}
          </Badge>
          {t("demoBanner.text")}
        </p>
      ) : null}
      <SeasonalTheme area="portals" />
      {/* 0125: cada colaborador é PJ — sem CNPJ, nível e o termo vigente, o portal pede isso antes de tudo */}
      {ctx.role && !memberProfileComplete(ctx.memberProfile) ? (
        <section className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-6" data-testid="member-profile-gate">
          <div className="flex flex-col gap-1">
            <h1 className="type-h2 text-fg">{tg("title")}</h1>
            <p className="type-body-sm text-fg-muted">{tg("body")}</p>
          </div>
          <MemberProfileForm mode="complete" doneHref="/agencia" initial={{ fullName: ctx.memberName, cnpj: ctx.memberProfile?.cnpj, jobTitle: ctx.memberTitle, level: ctx.memberProfile?.level }} />
        </section>
      ) : (
        children
      )}
      {/* boas-vindas do portal: só para quem é membro (o admin que só supervisiona não vê) */}
      {ctx.role ? <WelcomeTourMount area="agencia" /> : null}
    </PortalShell>
  );
}
