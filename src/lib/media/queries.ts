import "server-only";
import { getUser } from "@/lib/auth/session";
import { toRights, type Rights } from "@/lib/offer/rights";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { toMetricReading, type MetricReading, type SaleRow } from "./metrics";

// Leituras do bloco 6 (0083). Métricas, comentários, links, músicas e vendas pela RLS (cada lado vê o que pode:
// a marca os influenciadores dela, o creator só os dele, a agência o negócio; vendas só a marca e o Adm).
// Biblioteca pela RPC brand_library (o banco calcula o vencimento do direito de uso).

export type DealComment = { id: string; deliverableId: string; versionId: string; authorSide: "brand" | "agency"; authorLabel: string; body: string; atSeconds: number | null; createdAt: string; mine: boolean };
export type TrackingLink = { id: string; dealTalentId: string; talentId: string; code: string; coupon: string; destinationUrl: string; clicks: number; lastClickAt: string | null };
export type MusicTrack = { id: string; title: string; artist: string; source: string; url: string | null; networks: string[]; validUntil: string | null };
export type DealMedia = { metrics: MetricReading[]; comments: DealComment[]; links: TrackingLink[]; music: MusicTrack[]; sales: SaleRow[] };

export const EMPTY_MEDIA: DealMedia = { metrics: [], comments: [], links: [], music: [], sales: [] };

export async function getDealMedia(dealId: string, opts: { sales?: boolean } = {}): Promise<{ available: boolean; data: DealMedia }> {
  if (!/^[0-9a-f-]{36}$/i.test(dealId)) return { available: true, data: EMPTY_MEDIA };
  const supabase = await createClient();
  const [user, m, c, l, mu, s] = await Promise.all([
    getUser(),
    supabase.from("deliverable_metrics").select("id, deliverable_id, source, measured_on, created_at, entered_side, reach, views, likes, comments, shares, saves, clicks").eq("deal_id", dealId).order("measured_on", { ascending: false }).limit(1000),
    supabase.from("deliverable_comments").select("id, deliverable_id, version_id, author_side, author_id, author_label, body, at_seconds, created_at").eq("deal_id", dealId).order("created_at", { ascending: true }).limit(1000),
    supabase.from("campaign_tracking_links").select("id, deal_talent_id, talent_id, code, coupon, destination_url, clicks, last_click_at").eq("deal_id", dealId),
    supabase.from("campaign_music_tracks").select("id, title, artist, source, url, networks, valid_until").eq("deal_id", dealId).order("created_at", { ascending: true }),
    opts.sales ? supabase.from("campaign_sales").select("id, link_id, deal_talent_id, coupon, quantity, revenue_cents, reported_on, note, created_by").eq("deal_id", dealId).order("reported_on", { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (m.error && isMissingSchema(m.error)) return { available: false, data: EMPTY_MEDIA };
  return {
    available: true,
    data: {
      metrics: (m.data ?? []).map((r) => toMetricReading(r as unknown as Record<string, unknown>)),
      comments: (c.data ?? []).map((r) => ({
        id: r.id,
        deliverableId: r.deliverable_id,
        versionId: r.version_id,
        authorSide: r.author_side === "agency" ? "agency" : "brand",
        authorLabel: r.author_label,
        body: r.body,
        atSeconds: r.at_seconds,
        createdAt: r.created_at,
        mine: Boolean(user && r.author_id === user.id),
      })),
      links: (l.data ?? []).map((r) => ({ id: r.id, dealTalentId: r.deal_talent_id, talentId: r.talent_id, code: r.code, coupon: r.coupon, destinationUrl: r.destination_url, clicks: Number(r.clicks), lastClickAt: r.last_click_at })),
      music: (mu.data ?? []).map((r) => ({ id: r.id, title: r.title, artist: r.artist, source: r.source, url: r.url, networks: r.networks ?? [], validUntil: r.valid_until })),
      sales: ((s.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        linkId: String(r.link_id),
        dealTalentId: String(r.deal_talent_id),
        coupon: String(r.coupon ?? ""),
        quantity: Number(r.quantity ?? 0),
        revenueCents: Number(r.revenue_cents ?? 0),
        reportedOn: String(r.reported_on),
        note: String(r.note ?? ""),
        createdBy: r.created_by ? String(r.created_by) : null,
      })),
    },
  };
}

export type LibraryItem = {
  id: string;
  title: string;
  kind: string;
  network: string | null;
  status: string;
  url: string | null;
  published: boolean;
  publishedAt: string | null;
  approvedAt: string | null;
  talentName: string;
  requestId: string | null;
  campaign: string;
  rights: Rights | null;
  baseOn: string | null;
  expiresOn: string | null;
  daysLeft: number | null;
};

export async function getBrandLibrary(brandId: string): Promise<{ available: boolean; today: string | null; items: LibraryItem[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_library", { p_brand: brandId });
  if (error) return { available: !isMissingSchema(error), today: null, items: [] };
  const raw = (data ?? {}) as { today?: string; items?: Record<string, unknown>[] };
  const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
  return {
    available: true,
    today: str(raw.today),
    items: (raw.items ?? []).map((x) => ({
      id: String(x.id),
      title: String(x.title ?? ""),
      kind: String(x.kind ?? "other"),
      network: str(x.network),
      status: String(x.status ?? ""),
      url: str(x.url),
      published: x.published === true,
      publishedAt: str(x.published_at),
      approvedAt: str(x.approved_at),
      talentName: String(x.talent_name ?? ""),
      requestId: str(x.request_id),
      campaign: String(x.campaign ?? ""),
      rights: x.rights ? toRights(x.rights) : null,
      baseOn: str(x.base_on),
      expiresOn: str(x.expires_on),
      daysLeft: x.days_left === null || x.days_left === undefined ? null : Number(x.days_left),
    })),
  };
}
