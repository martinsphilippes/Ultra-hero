import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { BrandMemberRemove } from "@/components/agency/BrandMemberRemove";
import { InviteDialog } from "@/components/agency/InviteDialog";
import { RevokeInviteButton } from "@/components/agency/RevokeInviteButton";
import { RoleBadge } from "@/components/agency/RoleBadge";
import { Avatar, EmptyState, PageHeader, Section } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { getUser } from "@/lib/auth/session";
import { listBrandInvites, listBrandMembers } from "@/lib/agency/queries";
import { requireBrand } from "@/lib/brand-portal/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandPortal.meta");
  return { title: t("team") };
}

// Equipe da marca: o dono convida e remove a equipe; a equipe só consulta.
export default async function BrandTeamPage() {
  const ctx = await requireBrand();
  const isOwner = ctx.role === "owner";
  const [t, locale, user, members, invites] = await Promise.all([
    getTranslations("brandPortal.team"),
    getLocale(),
    getUser(),
    listBrandMembers(ctx.brand.id),
    isOwner ? listBrandInvites(ctx.brand.id) : Promise.resolve([]),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={isOwner ? t("descriptionOwner") : t("descriptionStaff")}
        actions={isOwner ? <InviteDialog target={{ kind: "brandStaff" }} roles={["staff"]} /> : null}
      />
      <Section title={t("membersTitle", { count: members.length })}>
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="brand-team">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={m.name} size="sm" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-fg">{m.name}</span>
                  <span className="type-caption text-fg-muted">{t("since", { date: formatDate(m.since, locale as Locale) })}</span>
                </div>
                <RoleBadge role={m.role === "owner" ? "owner" : "brandStaff"} />
              </div>
              {isOwner && m.role === "staff" && m.userId !== user?.id ? <BrandMemberRemove brandId={ctx.brand.id} userId={m.userId} name={m.name} from="brand" /> : null}
            </li>
          ))}
        </ul>
      </Section>
      {isOwner ? (
        <Section title={t("invitesTitle")}>
          {invites.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-fg">{i.email}</span>
                    <span className="type-caption text-fg-muted">{t("inviteExpires", { date: formatDate(i.expiresAt, locale as Locale) })}</span>
                  </div>
                  <RevokeInviteButton id={i.id} email={i.email} from="brand" />
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-border bg-surface">
              <EmptyState title={t("noInvites")} />
            </div>
          )}
        </Section>
      ) : null}
    </div>
  );
}
