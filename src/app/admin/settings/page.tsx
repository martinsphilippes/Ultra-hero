import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { DataTable, type Column } from "@/components/admin";
import { DemoAccountForm } from "@/components/admin-ops/DemoAccountForm";
import { OpsPanel } from "@/components/admin-ops/OpsPanel";
import { RetentionExceptionForm } from "@/components/admin-ops/RetentionExceptionForm";
import { SettingsEditor, type SettingRow } from "@/components/admin-ops/SettingsEditor";
import { CloseExceptionButton } from "@/components/admin-ops/StatusActions";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { hasAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.admin")} · ${t("admin.settings")}` };
}

type ExceptionRow = Tables<"retention_exceptions">;

// Configurações: editor tipado de app_settings, operações sob demanda, exceções de retenção e contas demo.
export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const [t, tn, locale, settingsRes, exceptionsRes, creatorsRes, sellersRes] = await Promise.all([
    getTranslations("adminOps.settings"),
    getTranslations("nav"),
    getLocale(),
    supabase.from("app_settings").select("key, value, description, updated_at").order("key"),
    supabase.from("retention_exceptions").select("*").order("closed_at", { ascending: true, nullsFirst: true }).order("review_at"),
    supabase.from("creator_profiles").select("id, name, user_id").order("name"),
    supabase.from("seller_organizations").select("id, name").eq("status", "active").order("name"),
  ]);
  if (settingsRes.error) throw new Error(settingsRes.error.message);
  const settings = (settingsRes.data ?? []) as SettingRow[];
  const updatedAtLabels = Object.fromEntries(settings.map((s) => [s.key, s.updated_at ? formatDateTime(s.updated_at, locale) : "—"]));
  const transportDefault = settings.find((s) => s.key === "transport.minutes_per_step")?.value;
  const exceptions = (exceptionsRes.data ?? []) as ExceptionRow[];
  const creators = (creatorsRes.data ?? []).map((c) => ({ id: c.id, name: c.name, linked: Boolean(c.user_id) }));
  const sellers = (sellersRes.data ?? []).map((s) => ({ id: s.id, name: s.name }));

  const columns: Column<ExceptionRow>[] = [
    {
      key: "scope",
      header: t("retention.scopeType"),
      cell: (e) => (
        <span className="flex flex-col">
          <span className="font-medium text-fg">{e.scope_type === "user" ? t("retention.scopeUser") : e.scope_type === "test_order" ? t("retention.scopeTestOrder") : e.scope_type}</span>
          <span className="break-all font-mono type-caption text-fg-muted">{e.scope_id}</span>
        </span>
      ),
    },
    { key: "reason", header: t("retention.reason"), className: "md:max-w-md", cell: (e) => <span className="line-clamp-3 whitespace-pre-wrap text-sm text-fg">{e.reason}</span> },
    {
      key: "owner",
      header: t("retention.owner"),
      hideOnMobile: true,
      cell: (e) =>
        e.owner_id ? (
          <Link href={`/admin/users/${e.owner_id}`} className="font-mono text-xs text-accent-text hover:underline">
            {e.owner_id.slice(0, 8)}…
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "review", header: t("retention.reviewAt"), cell: (e) => <span className="type-numeric">{formatDate(e.review_at, locale, undefined, "UTC")}</span> },
    {
      key: "status",
      header: t("retention.closedAt"),
      cell: (e) => (e.closed_at ? <span className="type-numeric text-fg-muted">{formatDateTime(e.closed_at, locale)}</span> : <Badge variant="warning">{t("retention.open")}</Badge>),
    },
    { key: "actions", header: "", align: "right", cell: (e) => (e.closed_at ? null : <CloseExceptionButton id={e.id} />) },
  ];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tn("portals.admin")} />

      <section aria-labelledby="settings-title" className="flex flex-col gap-3">
        <h2 id="settings-title" className="type-h2 text-fg">
          {t("sectionSwitches")}
        </h2>
        <SettingsEditor settings={settings} updatedAtLabels={updatedAtLabels} />
      </section>

      <section aria-labelledby="ops-title" className="flex flex-col gap-3">
        <div>
          <h2 id="ops-title" className="type-h2 text-fg">
            {t("ops.title")}
          </h2>
          <p className="type-caption text-fg-muted">{t("ops.description")}</p>
        </div>
        <OpsPanel defaultMinutes={typeof transportDefault === "number" ? transportDefault : 10} />
      </section>

      <section aria-labelledby="retention-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="retention-title" className="type-h2 text-fg">
              {t("retention.title")}
            </h2>
            <p className="type-caption text-fg-muted">{t("retention.description")}</p>
          </div>
          <RetentionExceptionForm />
        </div>
        <DataTable columns={columns} rows={exceptions} rowKey={(e) => e.id} caption={t("retention.tableCaption")} emptyTitle={t("retention.empty")} emptyDescription={t("retention.emptyDescription")} />
      </section>

      <section aria-labelledby="demo-title" className="flex flex-col gap-3">
        <div>
          <h2 id="demo-title" className="type-h2 text-fg">
            {t("demoAccounts.title")}
          </h2>
          <p className="type-caption text-fg-muted">{t("demoAccounts.description")}</p>
        </div>
        {hasAdminClient() ? (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <DemoAccountForm creators={creators} sellers={sellers} />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface/60">
            <EmptyState
              size="sm"
              icon={<KeyRound />}
              title={t("demoAccounts.unavailable")}
              description={t("demoAccounts.unavailableDescription")}
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link href="/admin/invitations">{t("demoAccounts.goInvitations")}</Link>
                </Button>
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
