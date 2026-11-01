import type { Metadata } from "next";
import { Building2, ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AgencyForm } from "@/components/agency/AdminAgencyForms";
import { InviteDialog } from "@/components/agency/InviteDialog";
import { Badge, EmptyState, PageHeader, Section } from "@/components/ui";
import { AGENCY_ROLES } from "@/lib/agency/roles";
import { requireRole } from "@/lib/auth/session";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminAgency");
  return { title: t("title") };
}

// /admin/agencia: agências (criar, editar, convidar o primeiro Adm) e membros por agência. Só o admin
// geral (is_platform_admin).
export default async function AdminAgencyPage() {
  await requireRole("admin", "/admin/agencia");
  const supabase = await createClient();
  const [t, { data: platformAdmin, error: adminError }] = await Promise.all([getTranslations("adminAgency"), supabase.rpc("is_platform_admin")]);

  if (adminError || !platformAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} description={t("description")} />
        <div className="rounded-2xl border border-border bg-surface" data-testid={adminError && isMissingSchema(adminError) ? "module-unavailable" : "admin-agency-forbidden"}>
          <EmptyState icon={<Building2 />} title={adminError && isMissingSchema(adminError) ? t("unavailable") : t("forbidden")} />
        </div>
      </div>
    );
  }

  const [{ data: agencies }, { data: members }] = await Promise.all([
    supabase.from("agencies").select("id, slug, name, status, contact_email").order("name"),
    supabase.from("agency_members").select("agency_id, role").is("revoked_at", null),
  ]);
  const count = (agencyId: string, role: string) => (members ?? []).filter((m) => m.agency_id === agencyId && m.role === role).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />

      <Section title={t("listTitle")}>
        <ul className="flex flex-col gap-3" data-testid="admin-agencies">
          {(agencies ?? []).map((a) => (
            <li key={a.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-fg">{a.name}</span>
                  <Badge variant={a.status === "active" ? "success" : "danger"} size="sm">
                    {t(`status.${a.status === "active" ? "active" : "suspended"}`)}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <InviteDialog target={{ kind: "adminAgency", agencyId: a.id }} roles={AGENCY_ROLES} triggerLabel={t("invite")} triggerVariant="secondary" />
                  <Link href="/agencia" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-text hover:underline">
                    {t("openPortal")}
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
              <p className="type-caption text-fg-muted">{t("teamCount", { admins: count(a.id, "admin"), managers: count(a.id, "manager"), staff: count(a.id, "staff") })}</p>
              <details className="rounded-xl border border-border bg-bg">
                <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-sm font-medium text-fg-muted">{t("edit")}</summary>
                <div className="px-3 pb-3">
                  <AgencyForm initial={{ id: a.id, name: a.name, slug: a.slug, status: a.status, contactEmail: a.contact_email ?? "" }} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("newTitle")}>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <AgencyForm />
        </div>
      </Section>

    </div>
  );
}
