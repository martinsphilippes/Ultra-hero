import { Mail } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { SellerForm } from "@/components/admin-ops/SellerForm";
import { MembershipRevokeButton } from "@/components/admin-ops/StatusActions";
import { Badge, Button } from "@/components/ui";
import { formatDateTime } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import type { FnReturns, Tables } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { SELLER_PORTAL_ENABLED } from "@/lib/seller-ops/portal";
import { getAdminSellerOrg } from "../_lib/org";

type Params = Promise<{ id: string }>;
type Membership = Tables<"seller_memberships"> & { email?: string | null; display_name?: string | null };
type UserRow = FnReturns<"admin_list_users">[number];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminOps.sellers");
  return { title: t("editTitle") };
}

// Aba Organização: edição do cadastro e do perfil (nome, slug, tipo, descrição, logo) + membros
// (revogação) + convite pré-preenchido. Status auditado fica no cabeçalho (layout).
export default async function EditSellerPage({ params }: { params: Params }) {
  const { id } = await params;
  const org = await getAdminSellerOrg(id);
  if (!org) notFound();
  const supabase = await createClient();
  const [t, tc, ts, locale, membersRes] = await Promise.all([
    getTranslations("adminOps.sellers"),
    getTranslations("adminOps.common"),
    getTranslations("adminCommon.status"),
    getLocale(),
    supabase.from("seller_memberships").select("*").eq("org_id", id).order("created_at"),
  ]);

  // E-mails dos membros vêm da RPC admin_list_users (único lugar que expõe e-mail).
  const members = (membersRes.data ?? []) as Membership[];
  if (members.length > 0) {
    const emails = new Map<string, UserRow>();
    for (let page = 0; page < 10; page++) {
      const { data } = await supabase.rpc("admin_list_users", { p_limit: 200, p_offset: page * 200 });
      for (const u of data ?? []) emails.set(u.id, u);
      if (!data || data.length < 200) break;
      if (members.every((m) => emails.has(m.user_id))) break;
    }
    for (const m of members) {
      const u = emails.get(m.user_id);
      m.email = u?.email ?? null;
      m.display_name = u?.display_name ?? null;
    }
  }

  const columns: Column<Membership>[] = [
    {
      key: "user",
      header: t("memberships.user"),
      cell: (m) => (
        <Link href={`/admin/users/${m.user_id}`} className="flex min-w-0 flex-col rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <span className="truncate font-medium text-accent-text hover:underline">{m.email ?? m.user_id}</span>
          {m.display_name && <span className="truncate type-caption text-fg-muted">{m.display_name}</span>}
        </Link>
      ),
    },
    {
      key: "role",
      header: t("memberships.role"),
      cell: (m) => (
        <Badge variant="neutral" size="sm">
          {m.role === "owner" ? t("memberships.owner") : t("memberships.staff")}
        </Badge>
      ),
    },
    { key: "since", header: t("memberships.since"), hideOnMobile: true, cell: (m) => <span className="type-numeric text-fg-muted">{formatDateTime(m.created_at, locale)}</span> },
    {
      key: "status",
      header: t("memberships.revokedAt"),
      cell: (m) => (m.revoked_at ? <span className="type-numeric text-danger">{formatDateTime(m.revoked_at, locale)}</span> : <StatusBadge status="active" label={ts("active")} />),
    },
    { key: "actions", header: "", align: "right", cell: (m) => (m.revoked_at ? null : <MembershipRevokeButton membershipId={m.id} orgId={id} />) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <p className="type-caption text-fg-muted">{tc("demoNote")}</p>

      <section aria-labelledby="org-form-title" className="rounded-2xl border border-border bg-surface p-4 md:p-6">
        <h2 id="org-form-title" className="type-h3 mb-4 text-fg">
          {t("editTitle")}
        </h2>
        <SellerForm
          id={org.id}
          initial={{ name: org.name, slug: org.slug, kind: org.kind as "own" | "partner", description: org.description ?? "", logoUrl: org.logo_url ?? "/placeholders/product-1.svg" }}
        />
      </section>

      <section aria-labelledby="members-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="members-title" className="type-h2 text-fg">
              {t("memberships.title")}
            </h2>
            <p className="type-caption text-fg-muted">{t("memberships.description")}</p>
            {SELLER_PORTAL_ENABLED ? null : <p className="type-caption text-fg-muted">{t("hub.portalOff")}</p>}
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/admin/invitations?new=1&role=seller&org=${org.id}`}>
              <Mail className="size-4" aria-hidden="true" />
              {t("memberships.invite")}
            </Link>
          </Button>
        </div>
        <DataTable columns={columns} rows={members} rowKey={(m) => m.id} caption={t("memberships.tableCaption")} emptyTitle={t("memberships.empty")} emptyDescription={t("memberships.emptyDescription")} />
      </section>
    </div>
  );
}
