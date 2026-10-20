import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditEntry } from "@/components/admin-ops/AuditEntry";
import { RoleToggles } from "@/components/admin-ops/RoleToggles";
import { Badge, DemoBadge, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/admin";
import { formatDate, formatDateTime, formatNumber } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { getUser } from "@/lib/auth/session";
import type { FnReturns } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ email?: string }>;
type UserRow = FnReturns<"admin_list_users">[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminOps.users.detail");
  return { title: t("title") };
}

// Não há RPC por id: localiza o usuário na listagem (com dica de e-mail, se vier da lista) ou varrendo páginas.
async function findUser(supabase: Awaited<ReturnType<typeof createClient>>, id: string, emailHint?: string): Promise<UserRow | null> {
  if (emailHint) {
    const { data } = await supabase.rpc("admin_list_users", { p_search: emailHint, p_limit: 10, p_offset: 0 });
    const hit = data?.find((u) => u.id === id);
    if (hit) return hit;
  }
  for (let page = 0; page < 10; page++) {
    const { data, error } = await supabase.rpc("admin_list_users", { p_limit: 200, p_offset: page * 200 });
    if (error) throw new Error(error.message);
    const hit = data?.find((u) => u.id === id);
    if (hit) return hit;
    if (!data || data.length < 200) break;
  }
  return null;
}

export default async function AdminUserDetailPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ id }, { email: emailHint }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [t, tn, ts, tco, locale, me, user] = await Promise.all([
    getTranslations("adminOps.users"),
    getTranslations("nav"),
    getTranslations("adminCommon.status"),
    getTranslations("adminOps.common"),
    getLocale(),
    getUser(),
    findUser(supabase, id, emailHint),
  ]);
  if (!user) notFound();

  const [profileRes, rolesRes, subRes, enrollRes, complRes, ordersRes, auditRes] = await Promise.all([
    supabase.from("profiles").select("display_name, locale, timezone, onboarding_completed, anonymized_at").eq("id", id).maybeSingle(),
    supabase.from("role_assignments").select("id, role, scope_type, scope_id, revoked_at").eq("user_id", id).is("revoked_at", null),
    supabase
      .from("simulated_subscriptions")
      .select("status, current_period_start, current_period_end, auto_renew, cancelled_at, subscription_modules(status, removal_at, plan_modules(code, name))")
      .eq("user_id", id)
      .maybeSingle(),
    supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("user_id", id),
    supabase.from("completions").select("id", { count: "exact", head: true }).eq("user_id", id),
    supabase.from("test_orders").select("id", { count: "exact", head: true }).eq("user_id", id),
    supabase.from("admin_audit").select("*").or(`actor_id.eq.${id},and(resource_type.eq.user,resource_id.eq.${id})`).order("created_at", { ascending: false }).limit(20),
  ]);

  const roles = rolesRes.data ?? [];
  const globalRoles = roles.filter((r) => r.scope_type === "global").map((r) => r.role);
  const scoped = roles.filter((r) => r.scope_type !== "global");
  // Nomes dos escopos (perfil de personalidade / organização) para exibição.
  const creatorIds = scoped.filter((r) => r.scope_type === "creator" && r.scope_id).map((r) => r.scope_id as string);
  const orgIds = scoped.filter((r) => r.scope_type === "seller_org" && r.scope_id).map((r) => r.scope_id as string);
  const [creatorsRes, orgsRes] = await Promise.all([
    creatorIds.length ? supabase.from("creator_profiles").select("id, name").in("id", creatorIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    orgIds.length ? supabase.from("seller_organizations").select("id, name").in("id", orgIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const scopeNames = new Map<string, string>([...(creatorsRes.data ?? []), ...(orgsRes.data ?? [])].map((x) => [x.id, x.name]));

  const profile = profileRes.data;
  const sub = subRes.data;
  const n = (v: number | null) => formatNumber(v ?? 0, locale);
  const dt = (v: string | null | undefined) => (v ? formatDateTime(v, locale) : "—");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={user.email ?? t("detail.title")}
        description={user.display_name ?? undefined}
        eyebrow={tn("admin.users")}
        backHref="/admin/users"
        backLabel={tn("admin.users")}
        actions={user.anonymized ? <Badge variant="warning">{t("columns.anonymized")}</Badge> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="profile-title" className="rounded-2xl border border-border bg-surface p-4">
          <h2 id="profile-title" className="type-h3 mb-3 text-fg">
            {t("detail.profile")}
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Row label={t("detail.email")} value={user.email ?? "—"} mono />
            <Row label={t("detail.displayName")} value={profile?.display_name ?? "—"} />
            <Row label={t("detail.locale")} value={profile?.locale ?? "—"} />
            <Row label={t("detail.timezone")} value={profile?.timezone ?? "—"} />
            <Row label={t("detail.onboarding")} value={profile?.onboarding_completed ? tco("yes") : tco("no")} />
            <Row label={t("detail.createdAt")} value={dt(user.created_at)} />
            <Row label={t("detail.lastSignIn")} value={user.last_sign_in_at ? dt(user.last_sign_in_at) : t("never")} />
            <Row label={t("detail.anonymizedAt")} value={dt(profile?.anonymized_at)} />
          </dl>
        </section>

        <section aria-labelledby="roles-title" className="rounded-2xl border border-border bg-surface p-4">
          <h2 id="roles-title" className="type-h3 text-fg">
            {t("detail.roles")}
          </h2>
          <p className="type-caption mb-2 text-fg-muted">{t("detail.rolesDescription")}</p>
          <RoleToggles userId={id} activeGlobalRoles={globalRoles} isSelf={me?.id === id} />
          <h3 className="mt-4 text-sm font-semibold text-fg">{t("detail.scopedRoles")}</h3>
          {scoped.length === 0 ? (
            <p className="type-caption text-fg-subtle">—</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {scoped.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <Badge variant="info" size="sm">
                    {t(`roles.${r.role}`)}
                  </Badge>
                  <span className="text-fg-muted">{t("detail.scope", { scope: (r.scope_id && scopeNames.get(r.scope_id)) ?? r.scope_id ?? "—" })}</span>
                  {r.scope_id && (
                    <Link href={r.scope_type === "creator" ? `/admin/creators/${r.scope_id}` : `/admin/sellers/${r.scope_id}`} className="text-accent-text hover:underline">
                      {tn(r.scope_type === "creator" ? "admin.creators" : "admin.sellers")}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="sub-title" className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 id="sub-title" className="type-h3 text-fg">
              {t("detail.subscription")}
            </h2>
            <DemoBadge size="sm" />
          </div>
          {!sub ? (
            <p className="type-body-sm text-fg-muted">{t("detail.subscriptionNone")}</p>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <Row label={t("detail.subscriptionStatus")} value={<StatusBadge status={sub.status} label={ts.has(sub.status) ? ts(sub.status) : sub.status} />} />
                <Row label={t("detail.period")} value={`${formatDate(sub.current_period_start, locale)} – ${formatDate(sub.current_period_end, locale)}`} />
                <Row label={t("detail.autoRenew")} value={sub.auto_renew ? "✓" : "—"} />
              </dl>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{t("detail.modules")}</p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {(sub.subscription_modules ?? []).map((m, i) => (
                    <li key={m.plan_modules?.code ?? i} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-2.5 py-1 text-xs">
                      <span className="font-medium text-fg">{m.plan_modules?.name ?? m.plan_modules?.code}</span>
                      {m.status === "scheduled_removal" && m.removal_at && <span className="text-warning">· {t("detail.moduleRemoval", { date: formatDate(m.removal_at, locale) })}</span>}
                    </li>
                  ))}
                  {(sub.subscription_modules ?? []).length === 0 && <li className="type-caption text-fg-subtle">—</li>}
                </ul>
              </div>
              <p className="type-caption text-fg-muted">{t("detail.subscriptionDemo")}</p>
            </div>
          )}
        </section>

        <section aria-labelledby="counts-title" className="rounded-2xl border border-border bg-surface p-4">
          <h2 id="counts-title" className="type-h3 mb-3 text-fg">
            {t("detail.counts")}
          </h2>
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[
              [t("detail.enrollments"), enrollRes.count],
              [t("detail.completions"), complRes.count],
              [t("detail.testOrders"), ordersRes.count],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-surface-elevated p-3">
                <dt className="type-caption text-fg-muted">{label}</dt>
                <dd className="type-numeric text-xl font-bold text-fg">{n(value as number | null)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section aria-labelledby="audit-title" className="flex flex-col gap-3">
        <h2 id="audit-title" className="type-h2 text-fg">
          {t("detail.audit")}
        </h2>
        {(auditRes.data ?? []).length === 0 ? (
          <p className="type-body-sm text-fg-muted">{t("detail.auditEmpty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {(auditRes.data ?? []).map((entry) => (
              <AuditEntry key={entry.id} entry={entry} actorEmail={entry.actor_id === id ? user.email : undefined} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className={mono ? "break-all font-mono text-xs text-fg" : "text-fg"}>{value}</dd>
    </>
  );
}
