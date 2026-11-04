import "server-only";
import { zonedDayKey } from "@/lib/calendar/grid";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import type { ExistingEvent } from "./import";
import { effectiveStatus, isPlatformStatus, isTerritory, LONG_EVENT_DAYS, normalizeHashtags, PLATFORM_DEFAULT_TZ, type InterestState, type PlatformStatus, type Territory } from "./vocab";

// Leituras do Calendário Groscove (0098). A RLS decide o que cada pessoa vê: leitores de portal só publicados/cancelados
// já no ar; admin (e agência co-editora) tudo. Consultas sempre por intervalo (mês da grade), nunca o ano inteiro.

export type PlatformEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string;
  territory: Territory | null;
  hashtags: string[];
  highlight: boolean;
  tentative: boolean;
  category: string | null;
  collection: string | null;
  /** Estado gravado (programado continua "scheduled" aqui; use `effective` para o que o leitor vê). */
  status: PlatformStatus;
  effective: PlatformStatus;
  publishedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string;
  sourceKey: string | null;
  source: string;
  importId: string | null;
  extra: Record<string, unknown>;
  updatedAt: string;
};

const SELECT =
  "id, title, description, location, starts_at, ends_at, all_day, timezone, territory, hashtags, highlight, tentative, category, collection, status, published_at, cancelled_at, cancel_reason, source_key, source, import_id, extra, updated_at";

type Row = {
  id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  timezone: string;
  territory: string | null;
  hashtags: string[] | null;
  highlight: boolean;
  tentative: boolean;
  category: string | null;
  collection: string | null;
  status: string;
  published_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string;
  source_key: string | null;
  source: string;
  import_id: string | null;
  extra: unknown;
  updated_at: string;
};

function toPlatformEvent(r: Row, now: Date): PlatformEvent {
  const status: PlatformStatus = isPlatformStatus(r.status) ? r.status : "draft";
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    location: r.location,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    allDay: r.all_day,
    timezone: r.timezone || PLATFORM_DEFAULT_TZ,
    territory: isTerritory(r.territory) ? r.territory : null,
    hashtags: normalizeHashtags(r.hashtags ?? []),
    highlight: r.highlight,
    tentative: r.tentative,
    category: r.category,
    collection: r.collection,
    status,
    effective: effectiveStatus(status, r.published_at, now),
    publishedAt: r.published_at,
    cancelledAt: r.cancelled_at,
    cancelReason: r.cancel_reason,
    sourceKey: r.source_key,
    source: r.source,
    importId: r.import_id,
    extra: r.extra && typeof r.extra === "object" && !Array.isArray(r.extra) ? (r.extra as Record<string, unknown>) : {},
    updatedAt: r.updated_at,
  };
}

/** Evento da plataforma → item da grade/lista da agenda (CalendarEvent com `platform`). */
export function platformToCalendar(e: PlatformEvent): CalendarEvent {
  const days = (new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime()) / 86_400_000;
  return {
    id: e.id,
    kind: "institutional",
    title: e.title,
    subtitle: e.category ?? "",
    description: e.description,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    allDay: e.allDay,
    location: e.location,
    brandId: null,
    dealId: null,
    talentId: null,
    deliverableId: null,
    sponsorshipId: null,
    source: "manual",
    visibleToBrand: false,
    visibleToTalent: false,
    updatedAt: e.updatedAt,
    edgesOnly: days > LONG_EVENT_DAYS,
    platform: {
      territory: e.territory,
      status: e.effective,
      hashtags: e.hashtags,
      highlight: e.highlight,
      tentative: e.tentative,
      category: e.category,
      collection: e.collection,
      timezone: e.timezone,
    },
  };
}

/**
 * Eventos da plataforma que tocam o intervalo [from, to). `published`: só o que os portais mostram (já no ar, sem
 * rascunho) — o admin enxerga tudo pela RLS, então a agenda dos portais pede só o publicado também para ele.
 */
export async function listPlatformEvents(filters: { from: string; to: string; published?: boolean }): Promise<{ available: boolean; items: PlatformEvent[] }> {
  const supabase = await createClient();
  const now = new Date();
  let query = supabase.from("calendar_events").select(SELECT).eq("scope", "platform").lt("starts_at", filters.to).gte("ends_at", filters.from).order("starts_at").limit(1000);
  if (filters.published !== false) query = query.neq("status", "draft").lte("published_at", now.toISOString());
  const { data, error } = await query;
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: ((data ?? []) as Row[]).map((r) => toPlatformEvent(r, now)) };
}

export async function getPlatformEvent(id: string): Promise<PlatformEvent | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("calendar_events").select(SELECT).eq("scope", "platform").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return toPlatformEvent(data as Row, new Date());
}

/** Vários eventos por id (só o que a RLS deixa ver; no máximo 100), na ordem de início. */
export async function getPlatformEventsByIds(ids: readonly string[], opts: { published?: boolean } = {}): Promise<PlatformEvent[]> {
  const list = [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 100);
  if (list.length === 0) return [];
  const supabase = await createClient();
  const now = new Date();
  let query = supabase.from("calendar_events").select(SELECT).eq("scope", "platform").in("id", list).order("starts_at");
  if (opts.published !== false) query = query.neq("status", "draft").lte("published_at", now.toISOString());
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as Row[]).map((r) => toPlatformEvent(r, now));
}

export type AdminEventFilters = { year?: number | null; territory?: Territory | null; status?: PlatformStatus | null; collection?: string | null; q?: string | null; page?: number };
export const ADMIN_PAGE_SIZE = 50;

/** Lista do admin (filtros por ano, território, estado, coleção e busca no título), paginada. */
export async function adminListPlatformEvents(f: AdminEventFilters): Promise<{ available: boolean; items: PlatformEvent[]; total: number }> {
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(f.page ?? 1));
  let query = supabase.from("calendar_events").select(SELECT, { count: "exact" }).eq("scope", "platform");
  if (f.year) query = query.gte("starts_at", `${f.year}-01-01T00:00:00-03:00`).lt("starts_at", `${f.year + 1}-01-01T00:00:00-03:00`);
  if (f.territory) query = query.eq("territory", f.territory);
  if (f.collection) query = query.eq("collection", f.collection);
  if (f.status === "scheduled") query = query.eq("status", "scheduled").gt("published_at", new Date().toISOString());
  else if (f.status === "published") query = query.in("status", ["published", "scheduled"]).lte("published_at", new Date().toISOString());
  else if (f.status) query = query.eq("status", f.status);
  const q = (f.q ?? "").trim().replace(/[%_,()]/g, " ").trim();
  if (q) query = query.ilike("title", `%${q}%`);
  const { data, error, count } = await query.order("starts_at").range((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE - 1);
  if (error) return { available: !isMissingSchema(error), items: [], total: 0 };
  const now = new Date();
  return { available: true, items: ((data ?? []) as Row[]).map((r) => toPlatformEvent(r, now)), total: count ?? 0 };
}

/** Coleções existentes (para o filtro). */
export async function listCollections(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("calendar_events").select("collection").eq("scope", "platform").not("collection", "is", null).limit(5000);
  return [...new Set((data ?? []).map((r) => r.collection).filter((x): x is string => Boolean(x)))].sort();
}

/** Todos os eventos da plataforma (id, chave, título, dia de início no fuso), em páginas de 1000, para a duplicidade. */
export async function existingForImport(): Promise<ExistingEvent[]> {
  const supabase = await createClient();
  const out: ExistingEvent[] = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await supabase
      .from("calendar_events")
      .select("id, source_key, title, starts_at, timezone")
      .eq("scope", "platform")
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error || !data) break;
    for (const r of data) out.push({ id: r.id, sourceKey: r.source_key, title: r.title, startDate: zonedDayKey(r.starts_at, r.timezone || PLATFORM_DEFAULT_TZ) });
    if (data.length < 1000) break;
  }
  return out;
}

export type ImportRecord = { id: string; sourceName: string; fileName: string; format: string; year: number | null; counts: Record<string, number>; createdAt: string };

export async function listImports(limit = 10): Promise<ImportRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("calendar_imports").select("id, source_name, file_name, format, year, counts, created_at").order("created_at", { ascending: false }).limit(limit);
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id,
    sourceName: r.source_name,
    fileName: r.file_name,
    format: r.format,
    year: r.year,
    counts: (r.counts && typeof r.counts === "object" && !Array.isArray(r.counts) ? r.counts : {}) as Record<string, number>,
    createdAt: r.created_at,
  }));
}

export type InterestItem = { id: string; party: "hero" | "brand"; ownerId: string; name: string; state: InterestState; updatedAt: string };

/** Interessados que a pessoa pode ver (RLS: admin tudo; agência o próprio casting e as marcas dela; marca/herói o seu). */
export async function listEventInterests(eventId: string): Promise<InterestItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("calendar_event_interests").select("id, party, creator_profile_id, brand_id, state, updated_at").eq("event_id", eventId).order("updated_at", { ascending: false }).limit(500);
  if (error || !data) return [];
  const heroIds = data.map((r) => r.creator_profile_id).filter((x): x is string => Boolean(x));
  const brandIds = data.map((r) => r.brand_id).filter((x): x is string => Boolean(x));
  const [heroes, brands] = await Promise.all([
    heroIds.length > 0 ? supabase.from("creator_profiles").select("id, name").in("id", heroIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    brandIds.length > 0 ? supabase.from("brands").select("id, name").in("id", brandIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const names = new Map<string, string>([...(heroes.data ?? []), ...(brands.data ?? [])].map((x) => [x.id, x.name]));
  return data.map((r) => {
    const ownerId = (r.creator_profile_id ?? r.brand_id) as string;
    return { id: r.id, party: r.party === "brand" ? "brand" : "hero", ownerId, name: names.get(ownerId) ?? "—", state: r.state === "withdrawn" ? "withdrawn" : "interested", updatedAt: r.updated_at };
  });
}

/** Contagens de interessados (todos os leitores). */
export async function interestSummary(eventId: string): Promise<{ heroes: number; brands: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_event_interest_summary", { p_event: eventId });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as { heroes?: number; brands?: number };
  return { heroes: Number(d.heroes ?? 0), brands: Number(d.brands ?? 0) };
}
