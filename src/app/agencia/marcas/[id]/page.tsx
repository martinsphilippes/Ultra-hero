import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { BrandArchiveButton } from "@/components/agency/BrandForms";
import { BrandMemberRemove } from "@/components/agency/BrandMemberRemove";
import { InviteDialog } from "@/components/agency/InviteDialog";
import { RevokeInviteButton } from "@/components/agency/RevokeInviteButton";
import { RoleBadge } from "@/components/agency/RoleBadge";
import { Avatar, Badge, EmptyState, PageHeader, Section } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { getAgencyBrand, listBrandInvites, listBrandMembers } from "@/lib/agency/queries";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("brand") };
}

type Props = { params: Promise<{ id: string }> };

// Ficha da marca: dados, quem da marca tem acesso ao portal, convites e o vínculo com a agência.
export default async function AgencyBrandPage({ params }: Props) {
  const ctx = await requireAgency("staff");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const link = await getAgencyBrand(ctx.agency.id, id);
  if (!link) notFound();
  const canEdit = agencyCan(ctx.role, "manager", ctx.platformAdmin);
  const active = link.status === "active";
  const [t, locale, members, invites] = await Promise.all([
    getTranslations("agency.brands"),
    getLocale(),
    listBrandMembers(id),
    canEdit ? listBrandInvites(id) : Promise.resolve([]),
  ]);
  const locked = ctx.agency.isDemo;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={link.brand.name}
        backHref="/agencia/marcas"
        backLabel={t("title")}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={active ? "success" : "neutral"} size="sm">
              {active ? t("linkActive") : t("linkArchived")}
            </Badge>
            <Badge variant={link.brand.status === "active" ? "info" : "neutral"} size="sm">
              {link.brand.status === "active" ? t("publicOn") : t("publicOff")}
            </Badge>
          </span>
        }
        actions={
          <a href={link.brand.siteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent-text hover:underline">
            {t("site")}
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        }
      />

      <Section
        title={t("membersTitle")}
        description={t("membersHint")}
        action={canEdit && active && !locked ? <InviteDialog target={{ kind: "brandMember", brandId: id }} roles={["owner", "staff"]} triggerVariant="secondary" /> : null}
      >
        {members.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="brand-members">
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
                {canEdit && active && !locked ? <BrandMemberRemove brandId={id} userId={m.userId} name={m.name} from="agency" /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState title={t("noMembers")} description={canEdit ? t("noMembersHint") : undefined} />
          </div>
        )}
      </Section>

      {canEdit && invites.length > 0 ? (
        <Section title={t("invitesTitle")}>
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-fg">{i.email}</span>
                  <span className="type-caption text-fg-muted">{t("inviteExpires", { date: formatDate(i.expiresAt, locale as Locale) })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <RoleBadge role={i.role === "owner" ? "owner" : "brandStaff"} />
                  <RevokeInviteButton id={i.id} email={i.email} from="agency" />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {canEdit && !locked ? (
        <section aria-labelledby="brand-link-status" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
          <h2 id="brand-link-status" className="text-sm font-semibold text-fg">
            {t("linkTitleStatus")}
          </h2>
          <p className="type-body-sm text-fg-muted">{active ? t("archiveHint") : t("reactivateHint")}</p>
          <BrandArchiveButton brandId={id} active={active} />
        </section>
      ) : null}
    </div>
  );
}
