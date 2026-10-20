import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuditEntry } from "@/components/admin-ops/AuditEntry";
import { PaginationNav } from "@/components/admin-ops/PaginationNav";
import { Button, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import type { Tables } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.admin")} · ${t("admin.audit")}` };
}

type SearchParams = Promise<{ action?: string; resource?: string; actor?: string; from?: string; to?: string; page?: string }>;
const PAGE_SIZE = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RESOURCE_TYPES = ["user", "invitation", "creator_profile", "seller_organization", "content", "program", "product", "content_product_link", "app_setting", "system", "test_order", "fulfillment"];

// Trilha de auditoria paginada com filtros; cada linha expande antes/depois com chaves alteradas em destaque.
export default async function AdminAuditPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const action = (sp.action ?? "").trim().slice(0, 80);
  const resource = (sp.resource ?? "").trim().slice(0, 60);
  const actor = UUID.test(sp.actor ?? "") ? (sp.actor as string) : "";
  const from = DATE.test(sp.from ?? "") ? (sp.from as string) : "";
  const to = DATE.test(sp.to ?? "") ? (sp.to as string) : "";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [t, tc, tn] = await Promise.all([getTranslations("adminOps.audit"), getTranslations("adminOps.common"), getTranslations("nav")]);

  const supabase = await createClient();
  let query = supabase
    .from("admin_audit")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (action) query = query.like("action", `${action.replace(/[%_]/g, "\\$&")}%`);
  if (resource) query = query.eq("resource_type", resource);
  if (actor) query = query.eq("actor_id", actor);
  if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59Z`);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Tables<"admin_audit">[];

  // Resolve e-mails dos atores desta página (RPC admin_list_users é o único lugar com e-mail).
  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter((id): id is string => Boolean(id))));
  const emails = new Map<string, string>();
  if (actorIds.length > 0) {
    for (let p = 0; p < 5; p++) {
      const { data: users } = await supabase.rpc("admin_list_users", { p_limit: 200, p_offset: p * 200 });
      for (const u of users ?? []) if (actorIds.includes(u.id) && u.email) emails.set(u.id, u.email);
      if (!users || users.length < 200 || actorIds.every((id) => emails.has(id))) break;
    }
  }

  const resourceTypes = Array.from(new Set([...RESOURCE_TYPES, ...rows.map((r) => r.resource_type)])).sort();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tn("portals.admin")} />
      <form method="get" action="/admin/audit" aria-label={tc("filters")} className="grid gap-3 rounded-xl border border-border bg-surface p-3 md:grid-cols-6 md:items-end">
        <Field id="a-action" label={t("filters.action")}>
          <Input id="a-action" name="action" defaultValue={action} placeholder={t("filters.actionPlaceholder")} autoComplete="off" />
        </Field>
        <Field id="a-resource" label={t("filters.resourceType")}>
          <Select id="a-resource" name="resource" defaultValue={resource}>
            <option value="">{tc("all")}</option>
            {resourceTypes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="a-actor" label={t("filters.actor")}>
          <Input id="a-actor" name="actor" defaultValue={actor} placeholder={t("filters.actorPlaceholder")} autoComplete="off" className="font-mono" />
        </Field>
        <Field id="a-from" label={t("filters.from")}>
          <Input id="a-from" name="from" type="date" defaultValue={from} />
        </Field>
        <Field id="a-to" label={t("filters.to")}>
          <Input id="a-to" name="to" type="date" defaultValue={to} />
        </Field>
        <div className="flex gap-2">
          <Button type="submit">
            {tc("apply")}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/admin/audit">{tc("clear")}</Link>
          </Button>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyDescription")} size="sm" />
      ) : (
        <div className="flex flex-col gap-2" role="list" aria-label={t("listLabel")}>
          {rows.map((entry) => (
            <div key={entry.id} role="listitem">
              <AuditEntry entry={entry} actorEmail={entry.actor_id ? emails.get(entry.actor_id) : undefined} />
            </div>
          ))}
        </div>
      )}
      <PaginationNav
        basePath="/admin/audit"
        params={{ action: action || undefined, resource: resource || undefined, actor: actor || undefined, from: from || undefined, to: to || undefined }}
        page={page}
        hasNext={(count ?? 0) > page * PAGE_SIZE}
        total={count ?? undefined}
      />
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-fg">
        {label}
      </label>
      {children}
    </div>
  );
}
