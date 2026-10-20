import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarClock, RefreshCw } from "lucide-react";
import { PlanSelector, type ModuleDependency, type PlanBundle, type PlanModule } from "@/components/me/PlanSelector";
import { PlanViewTracker } from "@/components/me/PlanViewTracker";
import { parseSubscription } from "@/components/me/subscription";
import { Badge, DemoBadge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency, formatDate } from "@/i18n/format";
import { getProfile, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/components/me/dates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("plan") };
}

// Plano simulado: estado atual (my_subscription), pacotes (plans + plan_bundle_modules), módulos e dependências.
// Preços são demonstrativos e vêm do banco; nenhuma cobrança real.

type PlanRow = { id: string; code: string; name: string; description: string | null; is_free: boolean; bundle: { module_id: string }[] };

export default async function PlanPage() {
  await requireUser("/profile/plan");
  const [profile, locale, t, tc] = await Promise.all([getProfile(), getLocale(), getTranslations("me.plan"), getTranslations("common")]);
  const uiLocale = locale as Locale;
  const tz = isValidTimeZone(profile?.timezone) ? profile.timezone : "UTC";
  const supabase = await createClient();

  const [subRes, plansRes, modulesRes, depsRes] = await Promise.all([
    supabase.rpc("my_subscription"),
    supabase.from("plans").select("id, code, name, description, is_free, bundle:plan_bundle_modules(module_id)").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("plan_modules").select("id, code, name, description, price_cents_demo").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("module_dependencies").select("module_id, requires_module_id"),
  ]);
  const firstError = [subRes, plansRes, modulesRes, depsRes].find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const subscription = parseSubscription(subRes.data);
  const modules = (modulesRes.data ?? []) as PlanModule[];
  const bundles: PlanBundle[] = ((plansRes.data ?? []) as unknown as PlanRow[]).map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    is_free: p.is_free,
    moduleIds: (p.bundle ?? []).map((b) => b.module_id),
  }));
  const dependencies = (depsRes.data ?? []) as ModuleDependency[];
  const statusKey = subscription.status === "anonymous" ? "free" : subscription.status;
  const periodEnd = subscription.current_period_end ? formatDate(subscription.current_period_end, uiLocale, undefined, tz) : null;

  return (
    <div className="flex flex-col gap-8">
      <PlanViewTracker />
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} backHref="/profile" backLabel={tc("actions.back")} actions={<DemoBadge />} />

      <p role="note" className="rounded-xl border border-dashed border-warning/40 bg-warning-soft px-4 py-3 type-body-sm text-fg">
        {t("demoNote")}
      </p>

      {/* Assinatura atual */}
      <section aria-labelledby="current-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="current-title" className="type-h2 text-fg">
            {t("current.title")}
          </h2>
          <Badge variant={statusKey === "active" ? "premium" : statusKey === "cancelled" ? "warning" : "free"}>{t(`current.status.${statusKey}`)}</Badge>
        </div>
        {statusKey === "free" || statusKey === "expired" ? (
          <p className="type-body-sm text-fg-muted">{t("current.freeDescription")}</p>
        ) : (
          <>
            {statusKey === "cancelled" && periodEnd ? (
              <p role="status" className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 type-body-sm text-fg">
                {t("current.cancelledNotice", { date: periodEnd })}
              </p>
            ) : null}
            <ul className="flex flex-col gap-1 type-body-sm text-fg-muted">
              {periodEnd ? (
                <li className="flex items-center gap-2">
                  <CalendarClock className="size-4" aria-hidden="true" />
                  {t("current.periodEnd", { date: periodEnd })}
                </li>
              ) : null}
              <li className="flex items-center gap-2">
                <RefreshCw className="size-4" aria-hidden="true" />
                {subscription.auto_renew ? t("current.autoRenewOn") : t("current.autoRenewOff")}
              </li>
            </ul>
            <h3 className="type-overline text-accent-text">{t("current.modules")}</h3>
            {subscription.modules.length === 0 ? (
              <p className="type-body-sm text-fg-muted">{t("current.noModules")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {subscription.modules.map((m) => (
                  <li key={m.module_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-fg">{m.name}</span>
                      <span className="type-caption text-fg-muted">
                        {formatCurrency(m.price_cents_demo / 100, uiLocale)} · {t("bundles.demoPrice")}
                      </span>
                    </span>
                    {m.status === "scheduled_removal" && m.removal_at ? (
                      <Badge variant="warning" size="sm">
                        {t("current.scheduledRemoval", { date: formatDate(m.removal_at, uiLocale, undefined, tz) })}
                      </Badge>
                    ) : (
                      <Badge variant="success" size="sm">
                        {t("current.activeModule")}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <PlanSelector subscription={subscription} modules={modules} bundles={bundles} dependencies={dependencies} />
    </div>
  );
}
