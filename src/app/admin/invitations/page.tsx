import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { FilterLink } from "@/components/admin-ops/FilterLink";
import { InvitationForm } from "@/components/admin-ops/InvitationForm";
import { PaginationNav } from "@/components/admin-ops/PaginationNav";
import { RevokeInvitationButton } from "@/components/admin-ops/StatusActions";
import { Badge, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.admin")} · ${t("admin.invitations")}` };
}

const STATUSES = ["pending", "accepted", "expired", "revoked"] as const;
type Status = (typeof STATUSES)[number];
type SearchParams = Promise<{ status?: string; page?: string; new?: string; role?: string; creator?: string; org?: string }>;
const PAGE_SIZE = 25;

type InvitationRow = {
  id: string;
  email: string;
  role: "creator" | "seller" | "admin" | "consumer" | "professional" | "agency" | "brand";
  status: Status;
  expires_at: string;
  created_at: string;
  creator_profile_id: string | null;
  seller_org_id: string | null;
  /** Convite de profissional (0058); ausente sem a migração. */
  professional_id?: string | null;
  /** Convites de agência e de marca (0064); ausentes sem a migração. */
  agency_id?: string | null;
  brand_id?: string | null;
  member_role?: string | null;
  creator_profiles: { name: string } | null;
  seller_organizations: { name: string } | null;
};

// Convites: criação (link exibido uma vez), filtros por status e revogação auditada.
export default async function AdminInvitationsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as Status) : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [t, tc, ts, tn, locale] = await Promise.all([
    getTranslations("adminOps.invitations"),
    getTranslations("adminOps.common"),
    getTranslations("adminCommon.status"),
    getTranslations("nav"),
    getLocale(),
  ]);
  const supabase = await createClient();
  const base = "id, email, role, status, expires_at, created_at, creator_profile_id, seller_org_id, creator_profiles(name), seller_organizations(name)";
  const listQuery = (columns: string) => {
    let query = supabase
      .from("invitations")
      .select(columns, { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (status) query = query.eq("status", status);
    return query;
  };
  // com a 0058 a lista também traz o profissional do convite; sem ela, a leitura de antes
  // com a 0064, também agência e marca; cada leitura cai para a anterior se a coluna ainda não existe
  const withAgency = await listQuery(`${base}, professional_id, agency_id, brand_id, member_role`);
  const withPro = withAgency.error ? await listQuery(`${base}, professional_id`) : withAgency;
  const [{ data, error, count }, creatorsRes, sellersRes] = await Promise.all([
    withPro.error ? listQuery(base) : Promise.resolve(withPro),
    supabase.from("creator_profiles").select("id, name, user_id").order("name"),
    supabase.from("seller_organizations").select("id, name").order("name"),
  ]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as InvitationRow[];
  const now = Date.now();

  const columns: Column<InvitationRow>[] = [
    { key: "email", header: t("columns.email"), cell: (r) => <span className="break-all font-medium text-fg">{r.email}</span> },
    {
      key: "role",
      header: t("columns.role"),
      cell: (r) => (
        <Badge variant="info" size="sm">
          {r.role === "agency"
            ? t("roleAgency")
            : r.role === "brand"
              ? t("roleBrand")
              : r.role === "professional"
                ? tn("portals.professional")
                : r.role === "creator"
                  ? t("form.roleCreator")
                  : t("form.roleSeller")}
        </Badge>
      ),
    },
    {
      key: "target",
      header: t("columns.target"),
      cell: (r) =>
        r.role === "agency" && r.agency_id ? (
          <Link href="/admin/agencia" className="text-accent-text hover:underline">
            {tn("admin.agency")}
          </Link>
        ) : r.role === "brand" && r.brand_id ? (
          <Link href={`/admin/marcas/${r.brand_id}`} className="text-accent-text hover:underline">
            {tn("admin.brands")}
          </Link>
        ) : r.role === "professional" && r.professional_id ? (
          <Link href={`/admin/professionals/${r.professional_id}`} className="text-accent-text hover:underline">
            {tn("admin.professionals")}
          </Link>
        ) : r.role === "creator" && r.creator_profile_id ? (
          <Link href={`/admin/creators/${r.creator_profile_id}`} className="text-accent-text hover:underline">
            {r.creator_profiles?.name ?? r.creator_profile_id}
          </Link>
        ) : r.seller_org_id ? (
          <Link href={`/admin/sellers/${r.seller_org_id}`} className="text-accent-text hover:underline">
            {r.seller_organizations?.name ?? r.seller_org_id}
          </Link>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    { key: "status", header: t("columns.status"), cell: (r) => <StatusBadge status={r.status} label={ts(r.status)} /> },
    {
      key: "expires",
      header: t("columns.expires"),
      hideOnMobile: true,
      cell: (r) => (
        <span className="type-numeric text-fg-muted">
          {formatDateTime(r.expires_at, locale)}
          {r.status === "pending" && new Date(r.expires_at).getTime() < now ? <span className="ml-1 text-warning">({t("expiredNote")})</span> : null}
        </span>
      ),
    },
    { key: "created", header: t("columns.created"), hideOnMobile: true, cell: (r) => <span className="type-numeric text-fg-muted">{formatDateTime(r.created_at, locale)}</span> },
    { key: "actions", header: "", align: "right", cell: (r) => (r.status === "pending" ? <RevokeInvitationButton id={r.id} /> : null) },
  ];

  const creators = (creatorsRes.data ?? []).map((c) => ({ id: c.id, name: c.name, linked: Boolean(c.user_id) }));
  const sellers = (sellersRes.data ?? []).map((s) => ({ id: s.id, name: s.name }));
  const initialRole = sp.role === "seller" ? "seller" : "creator";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        eyebrow={tn("portals.admin")}
        actions={<InvitationForm creators={creators} sellers={sellers} initialRole={initialRole} initialCreatorId={sp.creator} initialSellerId={sp.org} defaultOpen={sp.new === "1"} />}
      />
      <nav aria-label={t("filters.status")} className="flex flex-wrap gap-2">
        <FilterLink href="/admin/invitations" active={!status} label={tc("all")} />
        {STATUSES.map((s) => (
          <FilterLink key={s} href={`/admin/invitations?status=${s}`} active={status === s} label={ts(s)} />
        ))}
      </nav>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption={t("tableCaption")} emptyTitle={t("empty")} emptyDescription={t("emptyDescription")} />
      <PaginationNav basePath="/admin/invitations" params={{ status }} page={page} hasNext={(count ?? 0) > page * PAGE_SIZE} total={count ?? undefined} />
    </div>
  );
}
