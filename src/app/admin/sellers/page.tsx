import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { SellerStatusButton } from "@/components/admin-ops/StatusActions";
import { Badge, Button, DemoBadge, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.admin")} · ${t("admin.sellers")}` };
}

type SellerRow = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  status: "pending" | "active" | "suspended";
  logo_url: string | null;
  seller_memberships: { count: number }[];
};

// Organizações fornecedoras (fictícias): lista, status auditado e acesso aos membros.
export default async function AdminSellersPage() {
  const [t, ts, tn] = await Promise.all([getTranslations("adminOps.sellers"), getTranslations("adminCommon.status"), getTranslations("nav")]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("seller_organizations").select("id, slug, name, kind, status, logo_url, seller_memberships(count)").order("name");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as SellerRow[];

  const columns: Column<SellerRow>[] = [
    {
      key: "name",
      header: t("columns.name"),
      cell: (o) => (
        <Link href={`/admin/sellers/${o.id}`} className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <span className="size-8 shrink-0 overflow-hidden rounded-md border border-border bg-surface-elevated">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {o.logo_url && <img src={o.logo_url} alt="" className="size-full object-cover" />}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-accent-text hover:underline">{o.name}</span>
            <span className="truncate font-mono type-caption text-fg-muted">{o.slug}</span>
          </span>
        </Link>
      ),
    },
    {
      key: "kind",
      header: t("columns.kind"),
      cell: (o) => (
        <Badge variant={o.kind === "own" ? "accent" : "neutral"} size="sm">
          {o.kind === "own" ? t("kind.own") : t("kind.partner")}
        </Badge>
      ),
    },
    { key: "status", header: t("columns.status"), cell: (o) => <StatusBadge status={o.status} label={ts(o.status)} /> },
    { key: "members", header: t("columns.members"), hideOnMobile: true, align: "center", cell: (o) => <span className="type-numeric">{o.seller_memberships?.[0]?.count ?? 0}</span> },
    { key: "actions", header: "", align: "right", cell: (o) => <SellerStatusButton id={o.id} status={o.status} /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t("title")}
            <DemoBadge />
          </span>
        }
        description={t("description")}
        eyebrow={tn("portals.admin")}
        actions={
          <Button asChild>
            <Link href="/admin/sellers/new">
              <Plus className="size-4" aria-hidden="true" />
              {t("create")}
            </Link>
          </Button>
        }
      />
      <DataTable columns={columns} rows={rows} rowKey={(o) => o.id} caption={t("tableCaption")} emptyTitle={t("empty")} emptyDescription={t("emptyDescription")} />
    </div>
  );
}
