import "server-only";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { isEventKind, type EventKind } from "./vocab";

// Leituras da agenda (RLS decide o que cada portal vê). Sem a 0067: { available: false }.

export type CalendarEvent = {
  id: string;
  kind: EventKind;
  title: string;
  subtitle: string;
  description: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string;
  brandId: string | null;
  dealId: string | null;
  talentId: string | null;
  deliverableId: string | null;
  source: "manual" | "system";
  visibleToBrand: boolean;
  visibleToTalent: boolean;
  updatedAt: string;
};

const SELECT = "id, kind, title, subtitle, description, starts_at, ends_at, all_day, location, brand_id, deal_id, talent_id, deliverable_id, source, visible_to_brand, visible_to_talent, updated_at";

type Row = {
  id: string; kind: string; title: string; subtitle: string; description: string; starts_at: string; ends_at: string; all_day: boolean; location: string;
  brand_id: string | null; deal_id: string | null; talent_id: string | null; deliverable_id: string | null; source: string; visible_to_brand: boolean; visible_to_talent: boolean; updated_at: string;
};

function toEvent(r: Row): CalendarEvent {
  return {
    id: r.id,
    kind: isEventKind(r.kind) ? r.kind : "other",
    title: r.title,
    subtitle: r.subtitle,
    description: r.description,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    allDay: r.all_day,
    location: r.location,
    brandId: r.brand_id,
    dealId: r.deal_id,
    talentId: r.talent_id,
    deliverableId: r.deliverable_id,
    source: r.source === "system" ? "system" : "manual",
    visibleToBrand: r.visible_to_brand,
    visibleToTalent: r.visible_to_talent,
    updatedAt: r.updated_at,
  };
}

export type EventFilters = { from: string; to: string; agencyId?: string; talentId?: string; brandId?: string; dealId?: string; kind?: string };

export async function listEvents(filters: EventFilters): Promise<{ available: boolean; items: CalendarEvent[] }> {
  const supabase = await createClient();
  let query = supabase.from("calendar_events").select(SELECT).gte("starts_at", filters.from).lt("starts_at", filters.to).order("starts_at").limit(500);
  if (filters.agencyId) query = query.eq("agency_id", filters.agencyId);
  if (filters.talentId && /^[0-9a-f-]{36}$/i.test(filters.talentId)) query = query.eq("talent_id", filters.talentId);
  if (filters.brandId && /^[0-9a-f-]{36}$/i.test(filters.brandId)) query = query.eq("brand_id", filters.brandId);
  if (filters.dealId && /^[0-9a-f-]{36}$/i.test(filters.dealId)) query = query.eq("deal_id", filters.dealId);
  if (filters.kind && isEventKind(filters.kind)) query = query.eq("kind", filters.kind);
  const { data, error } = await query;
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: ((data ?? []) as Row[]).map(toEvent) };
}

/** Próximos eventos (a partir de agora) de um negócio, para a ficha. */
export async function listDealEvents(dealId: string, limit = 8): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("calendar_events").select(SELECT).eq("deal_id", dealId).gte("ends_at", new Date().toISOString()).order("starts_at").limit(limit);
  if (error) return [];
  return ((data ?? []) as Row[]).map(toEvent);
}

/** Feed da pessoa: existe e está ativo? (o token nunca é lido de volta) */
export async function myFeedState(): Promise<{ active: boolean; rotatedAt: string | null; lastFetchedAt: string | null; fetchCount: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("calendar_feeds").select("rotated_at, revoked_at, last_fetched_at, fetch_count").maybeSingle();
  if (error) return null;
  if (!data) return { active: false, rotatedAt: null, lastFetchedAt: null, fetchCount: 0 };
  return { active: !data.revoked_at, rotatedAt: data.rotated_at, lastFetchedAt: data.last_fetched_at, fetchCount: data.fetch_count };
}

/** Contagem de próximos eventos (Início dos portais). */
export async function upcomingCount(days = 14, filters: { agencyId?: string } = {}): Promise<number | null> {
  const supabase = await createClient();
  const now = new Date();
  let query = supabase.from("calendar_events").select("id", { count: "exact", head: true }).gte("starts_at", now.toISOString()).lt("starts_at", new Date(now.getTime() + days * 86_400_000).toISOString());
  if (filters.agencyId) query = query.eq("agency_id", filters.agencyId);
  const { count, error } = await query;
  if (error) return null;
  return count ?? 0;
}
