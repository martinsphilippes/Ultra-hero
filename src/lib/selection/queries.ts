import "server-only";
import { toCard, type TalentCard } from "@/lib/deals/queries";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { toRatingMap, toRatingSummary, type Decision, type Period, type RatingSummary, type ShortlistStatus } from "./logic";

// Leituras fechadas da 0081 (pré-seleção, comparação e notas). O banco decide o escopo; aqui só se normaliza.

type Row = Record<string, unknown>;
const isObj = (v: unknown): v is Row => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]).filter(isObj) : []);
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const uuidOk = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const shortlistStatus = (v: unknown): ShortlistStatus => (v === "sent" || v === "decided" ? v : "draft");
const decision = (v: unknown): Decision => (v === "approved" || v === "rejected" ? v : null);

export type ShortlistListItem = {
  id: string;
  title: string;
  status: ShortlistStatus;
  createdLabel: string;
  createdByMe: boolean;
  sentAt: string | null;
  decidedAt: string | null;
  updatedAt: string;
  requestId: string | null;
  items: number;
  approved: number;
  rejected: number;
};

export async function listShortlists(brandId: string): Promise<{ available: boolean; items: ShortlistListItem[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_shortlists_list", {
    p_brand: brandId,
  });
  if (error) return { available: !isMissingSchema(error), items: [] };
  return {
    available: true,
    items: arr(data).map((s) => ({
      id: text(s.id),
      title: text(s.title),
      status: shortlistStatus(s.status),
      createdLabel: text(s.created_label),
      createdByMe: s.created_by_me === true,
      sentAt: str(s.sent_at),
      decidedAt: str(s.decided_at),
      updatedAt: text(s.updated_at),
      requestId: str(s.request_id),
      items: num(s.items),
      approved: num(s.approved),
      rejected: num(s.rejected),
    })),
  };
}

export type ShortlistItem = {
  id: string;
  talentId: string;
  reason: string;
  decision: Decision;
  decisionNote: string;
  decidedLabel: string;
  decidedAt: string | null;
  inCatalog: boolean;
  card: TalentCard | null;
  rating: RatingSummary;
};
export type ShortlistDetail = {
  id: string;
  brandId: string;
  title: string;
  note: string;
  status: ShortlistStatus;
  createdLabel: string;
  createdByMe: boolean;
  sentAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  requestId: string | null;
  requestStatus: string | null;
  items: ShortlistItem[];
};

export async function getShortlist(id: string): Promise<ShortlistDetail | null> {
  if (!uuidOk(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_shortlist_detail", {
    p_id: id,
  });
  if (error || !isObj(data)) return null;
  return {
    id: text(data.id),
    brandId: text(data.brand_id),
    title: text(data.title),
    note: text(data.note),
    status: shortlistStatus(data.status),
    createdLabel: text(data.created_label),
    createdByMe: data.created_by_me === true,
    sentAt: str(data.sent_at),
    decidedAt: str(data.decided_at),
    createdAt: text(data.created_at),
    requestId: str(data.request_id),
    requestStatus: str(data.request_status),
    items: arr(data.items).map((i) => ({
      id: text(i.id),
      talentId: text(i.talent_id),
      reason: text(i.reason),
      decision: decision(i.decision),
      decisionNote: text(i.decision_note),
      decidedLabel: text(i.decided_label),
      decidedAt: str(i.decided_at),
      inCatalog: i.in_catalog === true,
      card: isObj(i.card) ? toCard(i.card) : null,
      rating: toRatingSummary(i.rating),
    })),
  };
}

export type CompareCard = TalentCard & {
  periods: Period[];
  rating: RatingSummary;
};

export async function compareTalents(brandId: string, ids: string[]): Promise<{ available: boolean; items: CompareCard[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_talent_compare", {
    p_brand: brandId,
    p_talents: ids,
  });
  if (error) return { available: !isMissingSchema(error), items: [] };
  return {
    available: true,
    items: arr(data).map((c) => ({
      ...toCard(c),
      periods: arr(c.periods).map((p) => ({
        kind: p.kind === "blocked" ? "blocked" : "available",
        startsOn: text(p.starts_on),
        endsOn: text(p.ends_on),
        note: text(p.note),
      })),
      rating: toRatingSummary(c.rating),
    })),
  };
}

export async function brandRatings(brandId: string): Promise<Record<string, RatingSummary>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_talent_ratings", {
    p_brand: brandId,
  });
  return error ? {} : toRatingMap(data);
}

export type HistoryRating = {
  id: string;
  deliverableId: string;
  deliverableTitle: string;
  kind: string;
  network: string | null;
  requestId: string | null;
  campaignTitle: string;
  onTime: boolean;
  quality: number;
  comment: string;
  ratedLabel: string;
  createdAt: string;
};
export type TalentHistory = {
  summary: RatingSummary;
  campaigns: {
    requestId: string | null;
    title: string;
    brandStatus: string;
    talentStatus: string;
    periodStart: string | null;
    periodEnd: string | null;
  }[];
  ratings: HistoryRating[];
};

const toHistoryRating = (g: Row): HistoryRating => ({
  id: text(g.id),
  deliverableId: text(g.deliverable_id),
  deliverableTitle: text(g.deliverable_title),
  kind: text(g.kind),
  network: str(g.network),
  requestId: str(g.request_id),
  campaignTitle: text(g.campaign_title),
  onTime: g.on_time === true,
  quality: num(g.quality),
  comment: text(g.comment),
  ratedLabel: text(g.rated_label),
  createdAt: text(g.created_at),
});

export async function getTalentHistory(brandId: string, talentId: string): Promise<TalentHistory | null> {
  if (!uuidOk(talentId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_talent_history", {
    p_brand: brandId,
    p_talent: talentId,
  });
  if (error || !isObj(data)) return null;
  return {
    summary: toRatingSummary(data.summary),
    campaigns: arr(data.campaigns).map((c) => ({
      requestId: str(c.request_id),
      title: text(c.title),
      brandStatus: text(c.brand_status),
      talentStatus: text(c.talent_status),
      periodStart: str(c.period_start),
      periodEnd: str(c.period_end),
    })),
    ratings: arr(data.ratings).map(toHistoryRating),
  };
}

export type AgencyRatingItem = {
  id: string;
  brandName: string;
  dealId: string;
  dealTitle: string;
  deliverableTitle: string;
  kind: string;
  onTime: boolean;
  quality: number;
  comment: string;
  ratedLabel: string;
  createdAt: string;
};
export type AgencyRatings = {
  summary: RatingSummary & { brands: number };
  items: AgencyRatingItem[];
};

export async function getAgencyTalentRatings(talentId: string): Promise<AgencyRatings | null> {
  if (!uuidOk(talentId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agency_talent_ratings", {
    p_talent: talentId,
  });
  if (error || !isObj(data)) return null;
  const summary = isObj(data.summary) ? data.summary : {};
  return {
    summary: { ...toRatingSummary(summary), brands: num(summary.brands) },
    items: arr(data.items).map((g) => ({
      id: text(g.id),
      brandName: text(g.brand_name),
      dealId: text(g.deal_id),
      dealTitle: text(g.deal_title),
      deliverableTitle: text(g.deliverable_title),
      kind: text(g.kind),
      onTime: g.on_time === true,
      quality: num(g.quality),
      comment: text(g.comment),
      ratedLabel: text(g.rated_label),
      createdAt: text(g.created_at),
    })),
  };
}
