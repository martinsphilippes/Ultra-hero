import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { InviteDialog } from "@/components/agency/InviteDialog";
import { MemberActions } from "@/components/agency/MemberActions";
import { RevokeInviteButton } from "@/components/agency/RevokeInviteButton";
import { RoleBadge } from "@/components/agency/RoleBadge";
import { Avatar, EmptyState, PageHeader, Section } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { getUser } from "@/lib/auth/session";
import { listTeam, listTeamInvites } from "@/lib/agency/queries";
import { AGENCY_ROLES } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("team") };
}

// Equipe da agência: membros por nível, convites pendentes e o convite novo. Só o Adm chega aqui.
export default async function AgencyTeamPage() {
  const ctx = await requireAgency("admin");
  const [t, locale, user, team, invites] = await Promise.all([
    getTranslations("agency.team"),
    getLocale(),
    getUser(),
    listTeam(ctx.agency.id),
    listTeamInvites(ctx.agency.id),
  ]);
  const locked = ctx.agency.isDemo;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} actions={locked ? null : <InviteDialog target={{ kind: "team" }} roles={AGENCY_ROLES} />} />
      {locked ? <p className="rounded-xl border border-dashed border-border-strong p-3 type-body-sm text-fg-muted">{t("demoLocked")}</p> : null}

      <section aria-labelledby="team-levels" className="grid gap-2 sm:grid-cols-3">
        <h2 id="team-levels" className="sr-only">
          {t("levelsTitle")}
        </h2>
        {AGENCY_ROLES.map((r) => (
          <div key={r} className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3">
            <RoleBadge role={r} />
            <p className="type-caption text-fg-muted">{t(`levels.${r}`)}</p>
          </div>
        ))}
      </section>

      <Section title={t("membersTitle", { count: team.length })}>
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="team-list">
          {team.map((m) => (
            <li key={m.userId} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={m.name} size="sm" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-fg">{m.name}</span>
                  <span className="truncate type-caption text-fg-muted">
                    {m.jobTitle ? `${m.jobTitle} · ` : ""}
                    {t("since", { date: formatDate(m.since, locale as Locale) })}
                  </span>
                </div>
                <RoleBadge role={m.role} />
              </div>
              {locked ? null : <MemberActions userId={m.userId} name={m.name} role={m.role} isSelf={m.userId === user?.id} />}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("invitesTitle")}>
        {invites.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="team-invites">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-fg">{i.email}</span>
                  <span className="type-caption text-fg-muted">{t("inviteExpires", { date: formatDate(i.expiresAt, locale as Locale) })}</span>
                </div>
                <div className="flex items-center gap-2">
                  {i.role === "admin" || i.role === "manager" || i.role === "staff" ? <RoleBadge role={i.role} /> : null}
                  <RevokeInviteButton id={i.id} email={i.email} from="agency" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState title={t("noInvites")} description={t("noInvitesHint")} />
          </div>
        )}
      </Section>
    </div>
  );
}
