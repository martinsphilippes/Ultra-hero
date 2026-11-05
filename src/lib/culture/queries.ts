import "server-only";
import { defaultTimeZone } from "@/i18n/config";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { getPlatformEventsByIds, listPlatformEvents, type PlatformEvent } from "@/lib/platform-calendar/queries";
import type { InterestState, Territory } from "@/lib/platform-calendar/vocab";
import { effectivePostStatus, isPostKind, isPostStatus, type AgendaPost } from "@/lib/editorial/vocab";
import { culturePeriod, parseCommercial, parseCultureMeta, parseOpportunities, selectCulture, type CommercialItem, type CultureLanes, type CultureMeta, type EventOpportunities } from "./select";

// Leituras da Real-Time Culture e do histórico comercial do evento (0101). Tudo pela RLS / RPCs fechadas: cada perfil
// recebe só o que já podia ver. Uma janela só de eventos (agora → +30 dias, mais temporadas em curso), nunca o ano inteiro.

export type CultureViewer = { party: "hero"; ownerId: string } | { party: "brand"; ownerId: string } | { party: null };

export type CultureData = {
  available: boolean;
  lanes: CultureLanes<PlatformEvent>;
  withOpportunities: { event: PlatformEvent; counts: EventOpportunities }[];
  meta: CultureMeta;
  posts: AgendaPost[];
  interests: Map<string, InterestState>;
};

const DAY_MS = 86_400_000;

export async function loadCulture(opts: { territory: Territory | null; viewer: CultureViewer; postsLimit?: number }): Promise<CultureData> {
  const now = new Date();
  const supabase = await createClient();
  const period = culturePeriod(now, defaultTimeZone);
  const [list, oppRes, metaRes, posts] = await Promise.all([
    listPlatformEvents({ from: now.toISOString(), to: new Date(now.getTime() + 30 * DAY_MS).toISOString(), published: true }),
    supabase.rpc("calendar_event_opportunities"),
    supabase.rpc("platform_culture_meta", { p_year: period.year, p_month: period.month }),
    listVisiblePosts({ limit: opts.postsLimit ?? 8 }),
  ]);
  const lanes = selectCulture(list.items, now, { territory: opts.territory });
  const opportunities = oppRes.error ? new Map<string, EventOpportunities>() : parseOpportunities(oppRes.data);
  const loaded = new Map(list.items.map((e) => [e.id, e]));
  const missing = [...opportunities.keys()].filter((id) => !loaded.has(id));
  const extra = missing.length > 0 ? await getPlatformEventsByIds(missing) : [];
  for (const e of extra) loaded.set(e.id, e);
  const withOpportunities = [...opportunities.entries()]
    .map(([id, counts]) => ({ event: loaded.get(id), counts }))
    .filter((x): x is { event: PlatformEvent; counts: EventOpportunities } => Boolean(x.event))
    .filter((x) => x.event.effective === "published" && new Date(x.event.endsAt).getTime() > now.getTime() && (!opts.territory || x.event.territory === opts.territory))
    .sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt))
    .slice(0, 12);
  const shownIds = [...new Set([...lanes.happening, ...lanes.featured, ...lanes.next7, ...lanes.next30, ...lanes.seasons, ...withOpportunities.map((x) => x.event)].map((e) => e.id))];
  const interests = await myInterests(opts.viewer, shownIds);
  return {
    available: list.available,
    lanes,
    withOpportunities,
    meta: metaRes.error ? { month: null, quarter: null } : parseCultureMeta(metaRes.data),
    posts: posts.items,
    interests,
  };
}

/** Estado do interesse da marca/Hero nos eventos mostrados (a RLS só devolve o próprio). */
async function myInterests(viewer: CultureViewer, eventIds: string[]): Promise<Map<string, InterestState>> {
  const out = new Map<string, InterestState>();
  if (viewer.party === null || eventIds.length === 0) return out;
  const supabase = await createClient();
  const column = viewer.party === "hero" ? "creator_profile_id" : "brand_id";
  const { data } = await supabase.from("calendar_event_interests").select("event_id, state").eq(column, viewer.ownerId).in("event_id", eventIds.slice(0, 200));
  for (const r of data ?? []) out.set(r.event_id, r.state === "withdrawn" ? "withdrawn" : "interested");
  return out;
}

// ---------------------------------------------------------------- conteúdos editoriais

const POST_SELECT = "id, scope, agency_id, kind, title, body, image_url, link_url, calendar_event_id, status, published_at, updated_at";

type PostRow = {
  id: string;
  scope: string;
  agency_id: string | null;
  kind: string;
  title: string;
  body: string;
  image_url: string | null;
  link_url: string | null;
  calendar_event_id: string | null;
  status: string;
  published_at: string | null;
  updated_at: string;
};

async function toPosts(rows: PostRow[]): Promise<AgendaPost[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const agencyIds = [...new Set(rows.map((r) => r.agency_id).filter((x): x is string => Boolean(x)))];
  const eventIds = [...new Set(rows.map((r) => r.calendar_event_id).filter((x): x is string => Boolean(x)))];
  const [agencies, events] = await Promise.all([
    agencyIds.length > 0 ? supabase.from("agencies").select("id, name").in("id", agencyIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    eventIds.length > 0 ? supabase.from("calendar_events").select("id, title").in("id", eventIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const agencyName = new Map((agencies.data ?? []).map((a) => [a.id, a.name]));
  const eventTitle = new Map((events.data ?? []).map((e) => [e.id, e.title]));
  const now = new Date();
  return rows.map((r) => {
    const status = isPostStatus(r.status) ? r.status : "draft";
    return {
      id: r.id,
      scope: r.scope === "agency" ? "agency" : "platform",
      agencyId: r.agency_id,
      agencyName: r.agency_id ? (agencyName.get(r.agency_id) ?? null) : null,
      kind: isPostKind(r.kind) ? r.kind : "news",
      title: r.title,
      body: r.body,
      imageUrl: r.image_url,
      linkUrl: r.link_url,
      // o título só vem se quem lê também vê o evento (RLS); senão o vínculo some da tela
      eventId: r.calendar_event_id && eventTitle.has(r.calendar_event_id) ? r.calendar_event_id : null,
      eventTitle: r.calendar_event_id ? (eventTitle.get(r.calendar_event_id) ?? null) : null,
      status,
      effective: effectivePostStatus(status, r.published_at, now),
      publishedAt: r.published_at,
      updatedAt: r.updated_at,
    };
  });
}

/** Notícias e dicas no ar que a pessoa vê (Groscove + agência da rede), mais recentes primeiro. */
export async function listVisiblePosts(opts: { limit?: number; eventId?: string } = {}): Promise<{ available: boolean; items: AgendaPost[] }> {
  const supabase = await createClient();
  let query = supabase
    .from("agenda_posts")
    .select(POST_SELECT)
    .neq("status", "draft")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(Math.min(50, opts.limit ?? 10));
  if (opts.eventId) query = query.eq("calendar_event_id", opts.eventId);
  const { data, error } = await query;
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: await toPosts((data ?? []) as PostRow[]) };
}

/** Planejamento editorial (editor): os do escopo, com data no intervalo ou sem data (rascunho). */
export async function listEditorialPosts(opts: { agencyId: string | null; from?: string; to?: string; limit?: number }): Promise<{ available: boolean; items: AgendaPost[] }> {
  const supabase = await createClient();
  let query = supabase.from("agenda_posts").select(POST_SELECT);
  query = opts.agencyId ? query.eq("scope", "agency").eq("agency_id", opts.agencyId) : query.eq("scope", "platform");
  if (opts.from && opts.to) query = query.or(`published_at.is.null,and(published_at.gte.${opts.from},published_at.lt.${opts.to})`);
  const { data, error } = await query.order("published_at", { ascending: false, nullsFirst: true }).limit(Math.min(200, opts.limit ?? 100));
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: await toPosts((data ?? []) as PostRow[]) };
}

export async function getEditorialPost(id: string, agencyId: string | null): Promise<AgendaPost | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  let query = supabase.from("agenda_posts").select(POST_SELECT).eq("id", id);
  query = agencyId ? query.eq("scope", "agency").eq("agency_id", agencyId) : query.eq("scope", "platform");
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return (await toPosts([data as PostRow]))[0] ?? null;
}

// ---------------------------------------------------------------- histórico comercial do evento

/** Propostas, negócios, chamadas e patrocínios ligados ao evento que a pessoa pode ver (sem valores). */
export async function eventCommercial(eventId: string): Promise<CommercialItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("calendar_event_commercial", { p_event: eventId });
  if (error) return [];
  return parseCommercial(data);
}

export type CultureSummary = { available: boolean; now: PlatformEvent[]; soon: PlatformEvent[]; hashtags: string[]; monthLabel: string };

/** Cartão "Real-Time Culture" no Início de cada portal: até 2 acontecendo agora, até 3 nos próximos 7 dias e as hashtags do mês. */
export async function loadCultureSummary(): Promise<CultureSummary> {
  const now = new Date();
  const supabase = await createClient();
  const period = culturePeriod(now, defaultTimeZone);
  const [list, metaRes] = await Promise.all([
    listPlatformEvents({ from: now.toISOString(), to: new Date(now.getTime() + 7 * DAY_MS).toISOString(), published: true }),
    supabase.rpc("platform_culture_meta", { p_year: period.year, p_month: period.month }),
  ]);
  const lanes = selectCulture(list.items, now);
  const meta = metaRes.error ? { month: null, quarter: null } : parseCultureMeta(metaRes.data);
  const featuredFirst = <E extends PlatformEvent>(xs: E[]) => [...xs.filter((e) => e.highlight), ...xs.filter((e) => !e.highlight)];
  return {
    available: list.available,
    now: featuredFirst(lanes.happening).slice(0, 2),
    soon: featuredFirst(lanes.next7).slice(0, 3),
    hashtags: meta.month?.hashtags.slice(0, 6) ?? [],
    monthLabel: meta.month?.label ?? "",
  };
}
