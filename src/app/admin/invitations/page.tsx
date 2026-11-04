import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { FilterLink } from "@/components/admin-ops/FilterLink";
import { InvitationForm } from "@/components/admin-ops/InvitationForm";
import { InvitesGate } from "@/components/invites/InvitesGate";
import { PaginationNav } from "@/components/admin-ops/PaginationNav";
import { RevokeInvitationButton } from "@/components/admin-ops/StatusActions";
import { Badge, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { getInvitesEnabled } from "@/lib/invitations/flag";
import { isAdminInviteRole, type AdminInviteRole } from "@/lib/invitations/rules";
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
  /** 0091: forma do convite (admin, consumer, onboarding, hero, hero_team…) e papel na equipe do herói. */
  kind?: string | null;
  team_role?: string | null;
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
  talent_id?: string | null;
  creator_profiles: { name: string } | null;
  seller_organizations: { name: string } | null;
};

// Convites: criação (link exibido uma vez), filtros por status e revogação auditada.
export default async function AdminInvitationsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as Status) : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [t, tc, ts, tn, locale, tp, invitesOn] = await Promise.all([
    getTranslations("adminOps.invitations"),
    getTranslations("adminOps.common"),
    getTranslations("adminCommon.status"),
    getTranslations("nav"),
    getLocale(),
    getTranslations("invites.paused"),
    getInvitesEnabled(),
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
  // com a 0064, também agência e marca; com a 0065, o talento; cada leitura cai para a anterior se a
  // coluna ainda não existe
  const withKind = await listQuery(`${base}, professional_id, agency_id, brand_id, member_role, talent_id, kind, team_role`);
  const withTalent = withKind.error ? await listQuery(`${base}, professional_id, agency_id, brand_id, member_role, talent_id`) : withKind;
  const withAgency = withTalent.error ? await listQuery(`${base}, professional_id, agency_id, brand_id, member_role`) : withTalent;
  const withPro = withAgency.error ? await listQuery(`${base}, professional_id`) : withAgency;
  const [{ data, error, count }, creatorsRes, sellersRes, creatorRolesRes, tr] = await Promise.all([
    withPro.error ? listQuery(base) : Promise.resolve(withPro),
    supabase.from("creator_profiles").select("id, name, user_id, slug, avatar_url").order("name"),
    supabase.from("seller_organizations").select("id, name").order("name"),
    // pessoas com papel creator (para a equipe do herói); o admin lê todos os papéis
    supabase.from("role_assignments").select("user_id").eq("role", "creator").is("revoked_at", null).limit(500),
    getTranslations("invites.roles"),
  ]);
  // 0097: fichas do casting que podem receber o convite de acesso (Herói → já no casting); sem a migração, lista vazia
  const talentsRes = await supabase.rpc("admin_invite_talent_options");
  const talents = (talentsRes.error ? [] : (talentsRes.data ?? [])).map((r) => ({ id: r.talent_id, name: r.display_name, agency: r.agency_name, hasHero: r.has_hero }));
  const creatorUserIds = Array.from(new Set((creatorRolesRes.data ?? []).map((r) => r.user_id)));
  const { data: creatorProfiles } = creatorUserIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", creatorUserIds)
    : { data: [] as Array<{ id: string; display_name: string | null }> };
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as InvitationRow[];
  // papel do convite: 0091 pela forma (kind); antes dela, pelos campos de escopo
  const roleLabel = (r: InvitationRow) =>
    r.kind === "hero" || (!r.kind && r.role === "creator" && r.creator_profile_id && !r.talent_id)
      ? tr("hero")
      : r.kind === "hero_team"
        ? tr("heroTeam")
        : r.role === "admin" || r.role === "consumer"
          ? tr(r.role)
          : r.role === "agency"
            ? t("roleAgency")
            : r.role === "brand"
              ? t("roleBrand")
              : r.role === "professional"
                ? tn("portals.professional")
                : r.role === "creator"
                  ? tr("hero")
                  : t("form.roleSeller");
  const now = Date.now();

  const columns: Column<InvitationRow>[] = [
    { key: "email", header: t("columns.email"), cell: (r) => <span className="break-all font-medium text-fg">{r.email}</span> },
    {
      key: "role",
      header: t("columns.role"),
      cell: (r) => (
        <Badge variant="info" size="sm">
          {roleLabel(r)}
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
        ) : r.role === "creator" && r.talent_id ? (
          <Link href={`/agencia/casting/${r.talent_id}`} className="text-accent-text hover:underline">
            {t("talentTarget")}
          </Link>
        ) : r.role === "professional" && r.professional_id ? (
          <Link href={`/admin/professionals/${r.professional_id}`} className="text-accent-text hover:underline">
            {tn("admin.professionals")}
          </Link>
        ) : r.role === "creator" && r.creator_profile_id ? (
          <Link href={`/admin/herois/${r.creator_profile_id}`} className="text-accent-text hover:underline">
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

  const creators = (creatorsRes.data ?? []).map((c) => ({ id: c.id, name: c.name, linked: Boolean(c.user_id), slug: c.slug, avatarUrl: c.avatar_url }));
  const sellers = (sellersRes.data ?? []).map((s) => ({ id: s.id, name: s.name }));
  // 0097: links antigos com role=creator (botão "convidar" na tela do herói) abrem o Herói → equipe desse herói
  const initialRole: AdminInviteRole = isAdminInviteRole(sp.role) ? sp.role : "hero";
  const nameById = new Map((creatorProfiles ?? []).map((p) => [p.id, p.display_name]));
  const creatorUsers = creatorUserIds.map((id) => ({ id, name: nameById.get(id) || id.slice(0, 8) })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        eyebrow={tn("portals.admin")}
        actions={
          <InvitesGate>
            <InvitationForm creators={creators} creatorUsers={creatorUsers} talents={talents} sellers={sellers} initialRole={initialRole} initialCreatorId={sp.creator} initialSellerId={sp.org} defaultOpen={sp.new === "1"} />
          </InvitesGate>
        }
      />
      {/* 0103: convites pausados — os já emitidos seguem valendo; o admin religa em Configurações */}
      {invitesOn ? null : (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-body-sm text-fg" data-testid="invites-paused-banner">
          {tp("adminBanner")}
          <Link href="/admin/settings" className="font-semibold text-accent-text hover:underline">
            {tp("adminTurnOn")}
          </Link>
        </p>
      )}
      <Link href="/admin/cadastros" className="self-start text-sm font-semibold text-accent-text hover:underline" data-testid="self-signups-link">
        {tp("selfSignupsLink")}
      </Link>
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
