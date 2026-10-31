import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { requireAgency } from "@/lib/agency/server";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("history") };
}

type AuditRow = { id: number; action: string; resource_type: string; resource_id: string | null; actor_type: string; justification: string | null; created_at: string };
const ACTORS = ["consumer", "creator", "seller", "admin", "system", "agency"];

// Histórico da agência (Adm): o que cada RPC do módulo gravou na auditoria (ação, objeto, quando, justificativa).
export default async function AgencyHistoryPage() {
  const ctx = await requireAgency("admin");
  const [t, locale] = await Promise.all([getTranslations("agency.history"), getLocale() as Promise<Locale>]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agency_audit_list", { p_agency: ctx.agency.id, p_limit: 100 });
  if (error && isMissingSchema(error)) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<ScrollText />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }
  const rows = ((data ?? []) as unknown as AuditRow[]).filter((r) => r && typeof r.action === "string");
  return (
    <div className="flex flex-col gap-5" data-testid="agency-history">
      <PageHeader title={t("title")} description={t("description")} />
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="history-list">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-0.5 p-3">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-fg">{r.action}</span>
                <span className="type-caption text-fg-muted">
                  {r.resource_type}
                  {r.resource_id ? ` · ${r.resource_id.slice(0, 8)}` : ""}
                </span>
              </span>
              <span className="type-caption text-fg-muted">
                {formatDateTime(r.created_at, locale)} · {t(`actor.${ACTORS.includes(r.actor_type) ? r.actor_type : "system"}`)}
              </span>
              {r.justification ? <span className="type-body-sm text-fg">“{r.justification}”</span> : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
