import "server-only";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { isAgencyRole, isBrandRole, type AgencyRole, type BrandRole } from "./roles";

// Leituras do portal da agência (RLS decide o que cada um vê). Sem a 0064: listas vazias.

export type TeamMember = { userId: string; role: AgencyRole; name: string; jobTitle: string | null; since: string };
export type PendingInvite = { id: string; email: string; role: string; expiresAt: string; createdAt: string };
export type AgencyBrand = {
  linkId: string;
  status: "active" | "archived";
  isDemo: boolean;
  accountManagerId: string | null;
  brand: { id: string; slug: string; name: string; logoUrl: string | null; siteUrl: string; status: string };
};
export type BrandMember = { userId: string; role: BrandRole; name: string; jobTitle: string | null; since: string };

const RANK: Record<AgencyRole, number> = { admin: 0, manager: 1, staff: 2 };

export async function listTeam(agencyId: string): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agency_members")
    .select("user_id, role, display_name, job_title, created_at")
    .eq("agency_id", agencyId)
    .is("revoked_at", null);
  if (error) return [];
  return (data ?? [])
    .filter((m) => isAgencyRole(m.role))
    .map((m) => ({ userId: m.user_id, role: m.role as AgencyRole, name: m.display_name, jobTitle: m.job_title, since: m.created_at }))
    .sort((a, b) => RANK[a.role] - RANK[b.role] || a.name.localeCompare(b.name, "pt-BR"));
}

/** Convites pendentes da equipe da agência (só o Adm lê, pela RLS). */
export async function listTeamInvites(agencyId: string): Promise<PendingInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, member_role, expires_at, created_at")
    .eq("agency_id", agencyId)
    .is("brand_id", null)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((i) => ({ id: i.id, email: i.email, role: i.member_role ?? "", expiresAt: i.expires_at, createdAt: i.created_at }));
}

type LinkRow = {
  id: string;
  status: string;
  is_demo: boolean;
  account_manager_id: string | null;
  brand: { id: string; slug: string; name: string; logo_url: string | null; site_url: string; status: string } | null;
};

const LINK_SELECT = "id, status, is_demo, account_manager_id, brand:brands!agency_brands_brand_fk(id, slug, name, logo_url, site_url, status)";

function toAgencyBrand(row: LinkRow): AgencyBrand | null {
  if (!row.brand) return null;
  return {
    linkId: row.id,
    status: row.status === "archived" ? "archived" : "active",
    isDemo: row.is_demo,
    accountManagerId: row.account_manager_id,
    brand: { id: row.brand.id, slug: row.brand.slug, name: row.brand.name, logoUrl: row.brand.logo_url, siteUrl: row.brand.site_url, status: row.brand.status },
  };
}

export async function listAgencyBrands(agencyId: string, status: "active" | "archived" | "all" = "active"): Promise<AgencyBrand[]> {
  const supabase = await createClient();
  let query = supabase.from("agency_brands").select(LINK_SELECT).eq("agency_id", agencyId);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return [];
  return ((data ?? []) as unknown as LinkRow[])
    .map(toAgencyBrand)
    .filter((b): b is AgencyBrand => b !== null)
    .sort((a, b) => a.brand.name.localeCompare(b.brand.name, "pt-BR"));
}

export async function getAgencyBrand(agencyId: string, brandId: string): Promise<AgencyBrand | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("agency_brands").select(LINK_SELECT).eq("agency_id", agencyId).eq("brand_id", brandId).maybeSingle();
  if (error || !data) return null;
  return toAgencyBrand(data as unknown as LinkRow);
}

export async function listBrandMembers(brandId: string): Promise<BrandMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_members")
    .select("user_id, role, display_name, job_title, created_at")
    .eq("brand_id", brandId)
    .is("revoked_at", null);
  if (error) return [];
  return (data ?? [])
    .filter((m) => isBrandRole(m.role))
    .map((m) => ({ userId: m.user_id, role: m.role as BrandRole, name: m.display_name, jobTitle: m.job_title, since: m.created_at }))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, "pt-BR") : a.role === "owner" ? -1 : 1));
}

/** Convites pendentes da equipe de uma marca (gestor+ da agência ou dono da marca, pela RLS). */
export async function listBrandInvites(brandId: string): Promise<PendingInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, member_role, expires_at, created_at")
    .eq("brand_id", brandId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((i) => ({ id: i.id, email: i.email, role: i.member_role ?? "", expiresAt: i.expires_at, createdAt: i.created_at }));
}

/** Marcas ativas do app que ainda não estão com esta agência (para vincular). */
export async function listLinkableBrands(agencyId: string): Promise<Array<{ id: string; name: string; slug: string }>> {
  const supabase = await createClient();
  const [{ data: brands }, { data: links }] = await Promise.all([
    supabase.from("brands").select("id, name, slug, is_demo").eq("status", "active").order("name").limit(200),
    supabase.from("agency_brands").select("brand_id").eq("agency_id", agencyId).eq("status", "active"),
  ]);
  const linked = new Set((links ?? []).map((l) => l.brand_id));
  return (brands ?? []).filter((b) => !b.is_demo && !linked.has(b.id)).map((b) => ({ id: b.id, name: b.name, slug: b.slug }));
}

export type AgencyDashboard = { available: boolean; members: number; brands: number; pendingInvites: number; unread: number };

export async function agencyDashboard(agencyId: string, canSeeInvites: boolean): Promise<AgencyDashboard> {
  const supabase = await createClient();
  const [members, brands, invites, unread] = await Promise.all([
    supabase.from("agency_members").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).is("revoked_at", null),
    supabase.from("agency_brands").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active"),
    canSeeInvites
      ? supabase.from("invitations").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "pending")
      : Promise.resolve({ count: 0, error: null }),
    supabase.from("inbox_notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  if (isMissingSchema(members.error)) return { available: false, members: 0, brands: 0, pendingInvites: 0, unread: 0 };
  return { available: true, members: members.count ?? 0, brands: brands.count ?? 0, pendingInvites: invites.count ?? 0, unread: unread.count ?? 0 };
}
