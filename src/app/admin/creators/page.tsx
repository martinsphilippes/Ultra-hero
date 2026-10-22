import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { CredentialsQueue } from "@/components/admin-ops/CredentialsQueue";
import { CreatorStatusButton } from "@/components/admin-ops/StatusActions";
import { Avatar, Badge, Button, PageHeader, PillarBadge } from "@/components/ui";
import type { Tables } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.admin")} · ${t("admin.creators")}` };
}

type CreatorRow = Pick<Tables<"creator_profiles">, "id" | "slug" | "name" | "pillars" | "status" | "user_id" | "is_fictional" | "avatar_url" | "sort_order" | "rights_status">;
type RightsStatus = "fictional" | "pending" | "authorized";
const RIGHTS_VARIANT: Record<RightsStatus, "demo" | "info" | "success"> = { fictional: "demo", pending: "info", authorized: "success" };

// Personalidades fictícias: lista com status, pilares, vínculo e ações auditadas.
export default async function AdminCreatorsPage() {
  const [t, tc, ts, tn] = await Promise.all([
    getTranslations("adminOps.creators"),
    getTranslations("adminOps.common"),
    getTranslations("adminCommon.status"),
    getTranslations("nav"),
  ]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("creator_profiles").select("id, slug, name, pillars, status, user_id, is_fictional, avatar_url, sort_order, rights_status").order("sort_order").order("name");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as CreatorRow[];

  const columns: Column<CreatorRow>[] = [
    {
      key: "name",
      header: t("columns.name"),
      cell: (c) => (
        <Link href={`/admin/creators/${c.id}`} className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <Avatar src={c.avatar_url} name={c.name} size="sm" alt="" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-accent-text hover:underline">{c.name}</span>
            <span className="truncate font-mono type-caption text-fg-muted">{c.slug}</span>
          </span>
        </Link>
      ),
    },
    {
      key: "pillars",
      header: t("columns.pillars"),
      cell: (c) => (
        <span className="flex flex-wrap gap-1">
          {c.pillars.map((p) => (
            <PillarBadge tone="pillar" key={p} pillar={p} size="sm" />
          ))}
        </span>
      ),
    },
    { key: "status", header: t("columns.status"), cell: (c) => <StatusBadge status={c.status} label={ts(c.status)} /> },
    {
      key: "user",
      header: t("columns.user"),
      hideOnMobile: true,
      cell: (c) =>
        c.user_id ? (
          <Link href={`/admin/users/${c.user_id}`} className="font-mono text-xs text-accent-text hover:underline">
            {c.user_id.slice(0, 8)}…
          </Link>
        ) : (
          <span className="type-caption text-fg-subtle">{tc("noUser")}</span>
        ),
    },
    {
      key: "fictional",
      header: t("columns.fictional"),
      hideOnMobile: true,
      cell: (c) => (
        <Badge variant={c.is_fictional ? "demo" : "danger"} size="sm">
          {c.is_fictional ? tc("fictional") : tc("no")}
        </Badge>
      ),
    },
    {
      key: "rights",
      header: t("columns.rights"),
      hideOnMobile: true,
      cell: (c) => {
        const rights = (c.rights_status as RightsStatus) in RIGHTS_VARIANT ? (c.rights_status as RightsStatus) : "fictional";
        return (
          <Badge variant={RIGHTS_VARIANT[rights]} size="sm">
            {t(`rights.${rights}`)}
          </Badge>
        );
      },
    },
    { key: "actions", header: "", align: "right", cell: (c) => <CreatorStatusButton id={c.id} status={c.status} /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        eyebrow={tn("portals.admin")}
        actions={
          <Button asChild>
            <Link href="/admin/creators/new">
              <Plus className="size-4" aria-hidden="true" />
              {t("create")}
            </Link>
          </Button>
        }
      />
      <DataTable columns={columns} rows={rows} rowKey={(c) => c.id} caption={t("tableCaption")} emptyTitle={t("empty")} emptyDescription={t("emptyDescription")} />
      {/* fila de credenciais do chef (P7): aprovação antes de o texto ir ao perfil público */}
      <CredentialsQueue />
    </div>
  );
}
