import type { Metadata } from "next";
import { ArrowRight, UserPlus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, EmptyState, PageHeader, type BadgeVariant } from "@/components/ui";
import { formatDateTime } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { requireRole } from "@/lib/auth/session";
import { adminHrefFor, parseSelfSignups, selfSignupState } from "@/lib/auth/self-signups";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invites.selfSignups");
  return { title: t("title") };
}

const STATE_VARIANT: Record<ReturnType<typeof selfSignupState>, BadgeVariant> = {
  inProgress: "neutral",
  cancelled: "neutral",
  pending: "warning",
  active: "success",
  inactive: "neutral",
  suspended: "danger",
  other: "neutral",
};

// /admin/cadastros (0103): agências, marcas e heróis criados por autosserviço nos últimos 14 dias. Cada linha abre a
// tela que já existe para ver e suspender (agência: editar na lista; marca e herói: ficha; herói pendente: aprovar).
export default async function AdminSelfSignupsPage() {
  await requireRole("admin", "/admin/cadastros");
  const supabase = await createClient();
  const [t, locale, { data, error }] = await Promise.all([getTranslations("invites.selfSignups"), getLocale(), supabase.rpc("admin_self_signups", { p_days: 14 })]);
  const rows = error ? [] : parseSelfSignups(data);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} backHref="/admin" backLabel={t("back")} />
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<UserPlus />} title={error ? t("unavailable") : t("empty")} />
        </div>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="self-signups">
          {rows.map((r) => {
            const state = selfSignupState(r);
            const href = adminHrefFor(r);
            return (
              <li key={r.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="accent" size="sm">
                    {t(`kinds.${r.kind}`)}
                  </Badge>
                  <Badge variant={STATE_VARIANT[state]} size="sm">
                    {t(`states.${state}`)}
                  </Badge>
                </div>
                <p className="text-sm font-semibold text-fg">{r.name ?? t("noName")}</p>
                <p className="break-all type-caption text-fg-muted">
                  {r.email} · {r.createdAt ? formatDateTime(r.createdAt, locale) : "—"}
                </p>
                {href ? (
                  <Link href={href} className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-accent-text hover:underline">
                    {state === "pending" && r.kind === "hero" ? t("approve") : t("open")}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
