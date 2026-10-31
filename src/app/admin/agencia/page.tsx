import type { Metadata } from "next";
import { Building2, CheckCircle2, CircleDashed, ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AgencyDemoButton, AgencyForm } from "@/components/agency/AdminAgencyForms";
import { InviteDialog } from "@/components/agency/InviteDialog";
import { Badge, EmptyState, PageHeader, Section } from "@/components/ui";
import { AGENCY_ROLES } from "@/lib/agency/roles";
import { requireRole } from "@/lib/auth/session";
import { AGENCY_DEMO_EMAIL, AGENCY_STAFF_DEMO_EMAIL, BRAND_DEMO_EMAIL, TALENT_DEMO_EMAIL } from "@/lib/demo/accounts";
import { isAgencyDemoReady, isDemoAccessEnabled } from "@/lib/demo/server";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminAgency");
  return { title: t("title") };
}

// /admin/agencia: agências (criar, editar, convidar o primeiro Adm), membros por agência e o ambiente
// de demonstração. Só o admin geral com conta real (a admin@demo vê o aviso; D6).
export default async function AdminAgencyPage() {
  await requireRole("admin", "/admin/agencia");
  const supabase = await createClient();
  const [t, { data: platformAdmin, error: adminError }] = await Promise.all([getTranslations("adminAgency"), supabase.rpc("is_platform_admin")]);

  if (adminError || !platformAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} description={t("description")} />
        <div className="rounded-2xl border border-border bg-surface" data-testid={adminError && isMissingSchema(adminError) ? "module-unavailable" : "admin-agency-demo-forbidden"}>
          <EmptyState icon={<Building2 />} title={adminError && isMissingSchema(adminError) ? t("unavailable") : t("demoForbidden")} />
        </div>
      </div>
    );
  }

  const [{ data: agencies }, { data: members }, demoReady] = await Promise.all([
    supabase.from("agencies").select("id, slug, name, status, is_demo, contact_email").order("is_demo").order("name"),
    supabase.from("agency_members").select("agency_id, role").is("revoked_at", null),
    isAgencyDemoReady(),
  ]);
  const count = (agencyId: string, role: string) => (members ?? []).filter((m) => m.agency_id === agencyId && m.role === role).length;
  const demoAccounts = [
    { key: "agency", email: AGENCY_DEMO_EMAIL, ready: demoReady.agency },
    { key: "agencyStaff", email: AGENCY_STAFF_DEMO_EMAIL, ready: demoReady.agencyStaff },
    { key: "brand", email: BRAND_DEMO_EMAIL, ready: demoReady.brand },
    { key: "talent", email: TALENT_DEMO_EMAIL, ready: demoReady.talent },
  ] as const;
  const anyReady = demoAccounts.some((a) => a.ready);

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
                  {a.is_demo ? (
                    <Badge variant="demo" size="sm">
                      {t("demoTag")}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!a.is_demo ? <InviteDialog target={{ kind: "adminAgency", agencyId: a.id }} roles={AGENCY_ROLES} triggerLabel={t("invite")} triggerVariant="secondary" /> : null}
                  <Link href="/agencia" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-text hover:underline">
                    {t("openPortal")}
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
              <p className="type-caption text-fg-muted">{t("teamCount", { admins: count(a.id, "admin"), managers: count(a.id, "manager"), staff: count(a.id, "staff") })}</p>
              {!a.is_demo ? (
                <details className="rounded-xl border border-border bg-bg">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-sm font-medium text-fg-muted">{t("edit")}</summary>
                  <div className="px-3 pb-3">
                    <AgencyForm initial={{ id: a.id, name: a.name, slug: a.slug, status: a.status, contactEmail: a.contact_email ?? "" }} />
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("newTitle")}>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <AgencyForm />
        </div>
      </Section>

      {/* ambiente de demonstração: desligado no encerramento do período de testes (DEMO_ACCESS_OFF) */}
      {isDemoAccessEnabled() ? (
        <Section title={t("demo.title")} description={t("demo.description")}>
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-warning/40 bg-surface p-4" data-testid="admin-agency-demo">
            <ul className="flex flex-col gap-1.5">
              {demoAccounts.map((acc) => (
                <li key={acc.key} className="flex items-center gap-2 type-body-sm">
                  {acc.ready ? <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> : <CircleDashed className="size-4 text-fg-subtle" aria-hidden="true" />}
                  <span className="font-medium text-fg">{t(`demo.accounts.${acc.key}`)}</span>
                  <span className="truncate font-mono text-xs text-fg-muted">{acc.email}</span>
                  <span className="sr-only">{acc.ready ? t("demo.ready") : t("demo.missing")}</span>
                </li>
              ))}
            </ul>
            <AgencyDemoButton ready={anyReady} />
            <p className="type-caption text-fg-muted">{t("demo.note")}</p>
          </div>
        </Section>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-3 py-2 type-caption text-fg-muted" data-testid="admin-agency-demo-off">
          {t("demo.off")}
        </p>
      )}
    </div>
  );
}
