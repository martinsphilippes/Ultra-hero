import "server-only";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import type { KitSource, SocialRow } from "./media-kit";
import { DEFAULT_KIT_FIELDS, type Availability, type CommercialStatus } from "./vocab";

// Leituras do casting (agência) e do escritório (talento). A RLS decide: a agência lê o casting dela;
// o talento lê só as próprias redes, vínculos de segmento e o próprio kit (nunca talent_profiles).

export type Segment = { id: string; slug: string; name: string; sortOrder: number; active: boolean };
export type TalentListItem = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  commercialStatus: CommercialStatus;
  availability: Availability;
  consent: "active" | "revoked" | "none";
  catalogVisible: boolean;
  hero: { name: string; slug: string; avatarUrl: string | null } | null;
  hasLogin: boolean;
  managerId: string | null;
  segmentIds: string[];
  topFollowers: number | null;
  archived: boolean;
};
export type TalentDetail = TalentListItem & {
  creatorId: string | null;
  userId: string | null;
  availabilityNote: string;
  contactEmail: string | null;
  contactPhone: string | null;
  internalNotes: string;
  lastContactAt: string | null;
  consentAt: string | null;
  consentVersion: string | null;
  consentRevokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};
export type SocialAccount = SocialRow & { id: string; declared_by: string | null; created_at: string };
export type MediaKitRow = {
  headline: string;
  about: string;
  visibleFields: string[];
  shareActive: boolean;
  shareExpiresAt: string | null;
  shareCreatedAt: string | null;
  shareRevokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  updatedAt: string | null;
};
export type TalentFilters = { segment?: string; availability?: string; status?: string; manager?: string; q?: string; archived?: boolean };

const LIST_SELECT =
  "id, display_name, city, state, commercial_status, availability, consent_at, consent_revoked_at, catalog_visible, creator_id, user_id, manager_id, archived_at, availability_note, contact_email, contact_phone, internal_notes, last_contact_at, consent_version, created_at, updated_at, creator:creator_profiles(name, slug, avatar_url), talent_segment_links(segment_id), talent_social_accounts(followers)";

type TalentRow = {
  id: string;
  display_name: string;
  city: string | null;
  state: string | null;
  commercial_status: string;
  availability: string;
  consent_at: string | null;
  consent_revoked_at: string | null;
  consent_version: string | null;
  catalog_visible: boolean;
  creator_id: string | null;
  user_id: string | null;
  manager_id: string | null;
  archived_at: string | null;
  availability_note: string;
  contact_email: string | null;
  contact_phone: string | null;
  internal_notes: string;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
  creator: { name: string; slug: string; avatar_url: string | null } | null;
  talent_segment_links: { segment_id: string }[] | null;
  talent_social_accounts: { followers: number | null }[] | null;
};

function toDetail(r: TalentRow): TalentDetail {
  const followers = (r.talent_social_accounts ?? []).map((a) => a.followers).filter((f): f is number => f !== null);
  return {
    id: r.id,
    name: r.display_name,
    city: r.city,
    state: r.state,
    commercialStatus: r.commercial_status as CommercialStatus,
    availability: r.availability as Availability,
    consent: r.consent_at && !r.consent_revoked_at ? "active" : r.consent_revoked_at ? "revoked" : "none",
    catalogVisible: r.catalog_visible,
    hero: r.creator ? { name: r.creator.name, slug: r.creator.slug, avatarUrl: r.creator.avatar_url } : null,
    hasLogin: Boolean(r.user_id) || Boolean(r.creator_id),
    managerId: r.manager_id,
    segmentIds: (r.talent_segment_links ?? []).map((l) => l.segment_id),
    topFollowers: followers.length > 0 ? Math.max(...followers) : null,
    archived: Boolean(r.archived_at),
    creatorId: r.creator_id,
    userId: r.user_id,
    availabilityNote: r.availability_note,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    internalNotes: r.internal_notes,
    lastContactAt: r.last_contact_at,
    consentAt: r.consent_at,
    consentVersion: r.consent_version,
    consentRevokedAt: r.consent_revoked_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
  };
}

export type ListResult<T> = { available: boolean; items: T[] };

export async function listSegments(agencyId: string, activeOnly = true): Promise<Segment[]> {
  const supabase = await createClient();
  let query = supabase.from("talent_segments").select("id, slug, name, sort_order, active").eq("agency_id", agencyId).order("sort_order");
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map((s) => ({ id: s.id, slug: s.slug, name: s.name, sortOrder: s.sort_order, active: s.active }));
}

export async function listTalents(agencyId: string, filters: TalentFilters = {}): Promise<ListResult<TalentListItem>> {
  const supabase = await createClient();
  let ids: string[] | null = null;
  if (filters.segment && /^[0-9a-f-]{36}$/i.test(filters.segment)) {
    const { data } = await supabase.from("talent_segment_links").select("talent_id").eq("segment_id", filters.segment).eq("agency_id", agencyId);
    ids = (data ?? []).map((l) => l.talent_id);
    if (ids.length === 0) return { available: true, items: [] };
  }
  let query = supabase.from("talent_profiles").select(LIST_SELECT).eq("agency_id", agencyId).order("display_name").limit(300);
  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (ids) query = query.in("id", ids);
  if (filters.availability) query = query.eq("availability", filters.availability);
  if (filters.status) query = query.eq("commercial_status", filters.status);
  if (filters.manager === "none") query = query.is("manager_id", null);
  else if (filters.manager && /^[0-9a-f-]{36}$/i.test(filters.manager)) query = query.eq("manager_id", filters.manager);
  const q = filters.q?.trim().replace(/[%_,()]/g, " ").slice(0, 60);
  if (q) query = query.ilike("display_name", `%${q}%`);
  const { data, error } = await query;
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: ((data ?? []) as unknown as TalentRow[]).map(toDetail) };
}

export async function getTalent(agencyId: string, id: string): Promise<TalentDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("talent_profiles").select(LIST_SELECT).eq("agency_id", agencyId).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return toDetail(data as unknown as TalentRow);
}

const SOCIAL_SELECT = "id, network, handle, url, followers, avg_views, avg_reach, engagement_bp, audience, source, as_of, declared_side, declared_by, created_at, updated_at";

export async function listSocial(talentId: string): Promise<SocialAccount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("talent_social_accounts").select(SOCIAL_SELECT).eq("talent_id", talentId).order("followers", { ascending: false, nullsFirst: false });
  if (error) return [];
  return (data ?? []) as unknown as SocialAccount[];
}

export async function getKit(talentId: string): Promise<MediaKitRow> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("media_kits")
    .select("headline, about, visible_fields, share_token_hash, share_expires_at, share_revoked_at, share_created_at, view_count, last_viewed_at, updated_at")
    .eq("talent_id", talentId)
    .maybeSingle();
  if (!data) {
    return { headline: "", about: "", visibleFields: [...DEFAULT_KIT_FIELDS], shareActive: false, shareExpiresAt: null, shareCreatedAt: null, shareRevokedAt: null, viewCount: 0, lastViewedAt: null, updatedAt: null };
  }
  const active = Boolean(data.share_token_hash) && !data.share_revoked_at && Boolean(data.share_expires_at) && new Date(data.share_expires_at as string).getTime() > Date.now();
  return {
    headline: data.headline,
    about: data.about,
    visibleFields: data.visible_fields,
    shareActive: active,
    shareExpiresAt: data.share_expires_at,
    shareCreatedAt: data.share_created_at,
    shareRevokedAt: data.share_revoked_at,
    viewCount: data.view_count,
    lastViewedAt: data.last_viewed_at,
    updatedAt: data.updated_at,
  };
}

/** Nomes dos segmentos do talento (pela RLS: a agência, ou o próprio talento). */
export async function talentSegmentNames(talentId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("talent_segment_links").select("segment:talent_segments(name, sort_order, active)").eq("talent_id", talentId);
  return ((data ?? []) as unknown as { segment: { name: string; sort_order: number; active: boolean } | null }[])
    .map((l) => l.segment)
    .filter((s): s is { name: string; sort_order: number; active: boolean } => Boolean(s?.active))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => s.name);
}

/** Foto e marcas públicas do herói ligado (o que já é público na página dele). */
export async function heroPublicExtras(creator: { id?: string | null; userId?: string | null }): Promise<{ photoUrl: string | null; brands: { name: string; logo_url: string | null }[] }> {
  if (!creator.id && !creator.userId) return { photoUrl: null, brands: [] };
  const supabase = await createClient();
  let query = supabase.from("creator_profiles").select("id, avatar_url").eq("status", "active");
  query = creator.id ? query.eq("id", creator.id) : query.eq("user_id", creator.userId as string);
  const { data: hero } = await query.maybeSingle();
  if (!hero) return { photoUrl: null, brands: [] };
  const { data: links } = await supabase
    .from("creator_brands")
    .select("sort_order, brand:brands(name, logo_url, status)")
    .eq("creator_id", hero.id)
    .eq("status", "active")
    .order("sort_order");
  const brands = ((links ?? []) as unknown as { brand: { name: string; logo_url: string | null; status: string } | null }[])
    .map((l) => l.brand)
    .filter((b): b is { name: string; logo_url: string | null; status: string } => b?.status === "active")
    .map((b) => ({ name: b.name, logo_url: b.logo_url }));
  return { photoUrl: hero.avatar_url, brands };
}

/** Tudo o que a prévia do kit precisa (o mesmo que o /kit devolveria com o link ativo). */
export async function kitSource(input: {
  talentId: string;
  name: string;
  city: string | null;
  state: string | null;
  creatorId?: string | null;
  heroUserId?: string | null;
  agencyName: string;
  agencyEmail: string | null;
  kit: MediaKitRow;
  networks: SocialRow[];
}): Promise<KitSource> {
  const [segments, extras] = await Promise.all([talentSegmentNames(input.talentId), heroPublicExtras({ id: input.creatorId, userId: input.heroUserId })]);
  return {
    name: input.name,
    photoUrl: extras.photoUrl,
    city: input.city,
    state: input.state,
    segments,
    networks: input.networks,
    headline: input.kit.headline,
    about: input.kit.about,
    visibleFields: input.kit.visibleFields,
    brands: extras.brands,
    agencyName: input.agencyName,
    agencyEmail: input.agencyEmail,
  };
}

export type ManagerOption = { userId: string; name: string };

/** Quem pode ser gestor responsável: Adm e gestores ativos da agência. */
export async function listManagers(agencyId: string): Promise<ManagerOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("agency_members").select("user_id, display_name, role").eq("agency_id", agencyId).is("revoked_at", null).in("role", ["admin", "manager"]).order("display_name");
  return (data ?? []).map((m) => ({ userId: m.user_id, name: m.display_name }));
}

/** Heróis ativos para ligar a um talento (o banco recusa quem já está em outro casting). */
export async function listHeroOptions(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("creator_profiles").select("id, name").eq("status", "active").order("name").limit(500);
  return (data ?? []).map((c) => ({ id: c.id, name: c.name }));
}

export type TalentDocument = { id: string; title: string; kind: string; mimeType: string; sizeBytes: number; status: string; shareTalent: boolean; restricted: boolean; uploaderSide: string; createdAt: string };

export async function listTalentDocuments(talentId: string): Promise<TalentDocument[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, kind, mime_type, size_bytes, status, share_talent, restricted, uploader_side, created_at")
    .eq("talent_id", talentId)
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    kind: d.kind,
    mimeType: d.mime_type,
    sizeBytes: d.size_bytes,
    status: d.status,
    shareTalent: d.share_talent,
    restricted: d.restricted,
    uploaderSide: d.uploader_side,
    createdAt: d.created_at,
  }));
}

export type TalentInvite = { id: string; email: string; expiresAt: string; createdAt: string };

export async function listTalentInvites(talentId: string): Promise<TalentInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("invitations").select("id, email, expires_at, created_at").eq("talent_id", talentId).eq("status", "pending").order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((i) => ({ id: i.id, email: String(i.email), expiresAt: i.expires_at, createdAt: i.created_at }));
}

/** Casting ativo da agência (Início): total e quantos estão em situação "ativo". */
export async function castingCounts(agencyId: string): Promise<{ total: number; active: number } | null> {
  const supabase = await createClient();
  const [all, active] = await Promise.all([
    supabase.from("talent_profiles").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).is("archived_at", null),
    supabase.from("talent_profiles").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).is("archived_at", null).eq("commercial_status", "active"),
  ]);
  if (all.error) return null;
  return { total: all.count ?? 0, active: active.count ?? 0 };
}
