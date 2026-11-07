import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { InviteDialog } from "@/components/agency/InviteDialog";
import { MemberActions } from "@/components/agency/MemberActions";
import { RevokeInviteButton } from "@/components/agency/RevokeInviteButton";
import { RoleBadge } from "@/components/agency/RoleBadge";
import { Avatar, Badge, EmptyState, PageHeader, Section } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { getUser } from "@/lib/auth/session";
import { listAccessRequests, listTeam, listTeamInvites } from "@/lib/agency/queries";
import { AccessRequestCard } from "@/components/team/AccessRequestCard";
import { isMemberLevel, levelRank } from "@/lib/team/levels";
import { createClient } from "@/lib/supabase/server";
import { AGENCY_ROLES } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { InvitesGate } from "@/components/invites/InvitesGate";
import { MemberSectors } from "@/components/roadmap/MemberSectors";
import { listTeamSectors } from "@/lib/roadmap/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("team") };
}

// Funcionários da agência (reunião Groscove: "uma aba de funcionários"): pedidos de acesso no topo, membros por nível
// de acesso e senioridade (cargo e nível escolhidos pela própria pessoa), convites pendentes e o convite novo. Só o Adm.
// 0107: setores de cada membro (Gestor, Estratégia, Operação, Comunicação) — as etapas dos roteiros vão ao setor.
export default async function AgencyTeamPage() {
  const ctx = await requireAgency("admin");
  const [t, tr, tl, tq, locale, user, team, invites, sectors, requests] = await Promise.all([
    getTranslations("agency.team"),
    getTranslations("roadmap.team"),
    getTranslations("team.profile.levels"),
    getTranslations("team.requests"),
    getLocale(),
    getUser(),
    listTeam(ctx.agency.id),
    listTeamInvites(ctx.agency.id),
    listTeamSectors(ctx.agency.id),
    listAccessRequests(ctx.agency.id),
  ]);
  // 0128: tipo de personalidade de cada um (o Adm vê o da equipe)
  const personality = new Map(
    (((await (await createClient()).from("personality_results").select("user_id, type").in("user_id", team.map((m) => m.userId))).data ?? []) as { user_id: string; type: string }[]).map((r) => [r.user_id, r.type]),
  );
  const locked = ctx.agency.isDemo;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} actions={
          locked ? null : (
            <InvitesGate>
              <InviteDialog target={{ kind: "team" }} roles={AGENCY_ROLES} />
            </InvitesGate>
          )
        } />
      {locked ? <p className="rounded-xl border border-dashed border-border-strong p-3 type-body-sm text-fg-muted">{t("demoLocked")}</p> : null}

      {/* 0125: pedidos de acesso (e-mail do domínio da agência) — no topo, bem à vista */}
      <Section id="pedidos" title={tq("title", { count: requests.length })} description={tq("description")} className="scroll-mt-20">
        {requests.length > 0 ? (
          <ul className="flex flex-col gap-3" data-testid="access-requests">
            {requests.map((r) => (
              <AccessRequestCard
                key={r.id}
                request={{ id: r.id, fullName: r.fullName, email: r.email, cnpj: r.cnpj, jobTitle: r.jobTitle, level: r.level, createdLabel: tq("since", { date: formatDate(r.createdAt, locale as Locale) }) }}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-4 type-body-sm text-fg-muted" data-testid="access-requests-empty">
            {tq("empty")}
          </p>
        )}
      </Section>

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

      <Section title={t("membersTitle", { count: team.length })} description={tr("hint")}>
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="team-list">
          {[...team].sort((a, b) => levelRank(b.level) - levelRank(a.level)).sort((a, b) => ["admin", "manager", "staff"].indexOf(a.role) - ["admin", "manager", "staff"].indexOf(b.role)).map((m) => (
            <li key={m.userId} className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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
                {personality.get(m.userId) ? (
                  <Badge variant="info" size="sm">
                    {personality.get(m.userId)}
                  </Badge>
                ) : null}
                {isMemberLevel(m.level) ? (
                  <Badge variant="neutral" size="sm">
                    {tl(`${m.level}.title`)}
                  </Badge>
                ) : null}
              </div>
              {locked ? null : <MemberActions userId={m.userId} name={m.name} role={m.role} isSelf={m.userId === user?.id} />}
              <div className="flex flex-col gap-1 sm:basis-full">
                <span className="type-caption text-fg-muted">{tr("title")}</span>
                <MemberSectors userId={m.userId} name={m.name} initial={sectors.get(m.userId) ?? []} locked={locked} />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="convites" title={t("invitesTitle")} className="scroll-mt-20">
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
