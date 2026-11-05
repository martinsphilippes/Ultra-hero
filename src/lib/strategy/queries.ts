import "server-only";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { isStrategyStatus, type StrategyFlags, type StrategyStatus } from "./vocab";

// Leituras das estratégias para marcas (0111, D3): banco de ideias e relatório do casting pelas RPCs (só membros da
// agência; marca e Hero nunca leem). Eventos do Calendário Groscove pela RLS da agenda da plataforma.

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]).filter((x) => x && typeof x === "object") : []);

export type StrategyIdea = StrategyFlags & {
  id: string;
  month: string;
  brandId: string | null;
  brand: string;
  brandLabel: string;
  segmentId: string | null;
  segment: string | null;
  talentId: string | null;
  talent: string | null;
  calendarEventId: string | null;
  event: string | null;
  eventOn: string | null;
  ideaOn: string | null;
  title: string;
  body: string;
  status: StrategyStatus;
  reviewNote: string;
  authorLabel: string;
  reviewedLabel: string;
  reviewedAt: string | null;
  sponsorshipId: string | null;
  sponsorship: string | null;
  sponsorshipStatus: string | null;
  sentAt: string | null;
  aiAssisted: boolean;
  updatedAt: string;
  mine: boolean;
};

export function toStrategyIdea(x: unknown): StrategyIdea | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const r = x as Row;
  if (typeof r.id !== "string" || !isStrategyStatus(r.status)) return null;
  return {
    id: r.id,
    month: String(r.month ?? "").slice(0, 10),
    brandId: s(r.brand_id),
    brand: String(r.brand ?? ""),
    brandLabel: String(r.brand_label ?? ""),
    segmentId: s(r.segment_id),
    segment: s(r.segment),
    talentId: s(r.talent_id),
    talent: s(r.talent),
    calendarEventId: s(r.calendar_event_id),
    event: s(r.event),
    eventOn: s(r.event_on),
    ideaOn: s(r.idea_on),
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    status: r.status,
    reviewNote: String(r.review_note ?? ""),
    authorLabel: String(r.author_label ?? ""),
    reviewedLabel: String(r.reviewed_label ?? ""),
    reviewedAt: s(r.reviewed_at),
    sponsorshipId: s(r.sponsorship_id),
    sponsorship: s(r.sponsorship),
    sponsorshipStatus: s(r.sponsorship_status),
    sentAt: s(r.sent_at),
    aiAssisted: r.ai_assisted === true,
    updatedAt: String(r.updated_at ?? ""),
    mine: r.mine === true,
    canEdit: r.can_edit === true,
    canDelete: r.can_delete === true,
    canSubmit: r.can_submit === true,
    canDecide: r.can_decide === true,
    canReady: r.can_ready === true,
    canReopen: r.can_reopen === true,
    canSend: r.can_send === true,
  };
}

export async function listStrategyIdeas(agencyId: string, month: string | null): Promise<{ available: boolean; canApprove: boolean; isManager: boolean; items: StrategyIdea[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("strategy_ideas_list", { p_agency: agencyId, p_month: month });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return { available: !error || !isMissingSchema(error), canApprove: false, isManager: false, items: [] };
  const r = data as Row;
  return {
    available: true,
    canApprove: r.can_approve === true,
    isManager: r.is_manager === true,
    items: rows(r.items).map(toStrategyIdea).filter((x): x is StrategyIdea => x !== null),
  };
}

export async function getStrategyIdea(id: string): Promise<{ available: boolean; data: StrategyIdea | null }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { available: true, data: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("strategy_idea_json", { p_id: id });
  if (error) return { available: !isMissingSchema(error), data: null };
  return { available: true, data: toStrategyIdea(data) };
}

export type CastingReport = {
  from: string;
  to: string;
  totals: { talents: number; active: number; posts: number; deliverables: number };
  talents: {
    talentId: string;
    name: string;
    segments: string[];
    postsCount: number;
    deliverablesCount: number;
    posts: { title: string; slug: string; type: string; publishedAt: string }[];
    deliverables: { title: string; kind: string; network: string | null; url: string | null; publishedAt: string; deal: string; brand: string }[];
  }[];
};

export async function getCastingReport(agencyId: string, from: string, to: string): Promise<{ available: boolean; data: CastingReport | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("strategy_casting_report", { p_agency: agencyId, p_from: from, p_to: to });
  if (error) return { available: !isMissingSchema(error), data: null };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { available: true, data: null };
  const r = data as Row;
  const tot = r.totals && typeof r.totals === "object" ? (r.totals as Row) : {};
  return {
    available: true,
    data: {
      from: String(r.from ?? from),
      to: String(r.to ?? to),
      totals: { talents: n(tot.talents), active: n(tot.active), posts: n(tot.posts), deliverables: n(tot.deliverables) },
      talents: rows(r.talents).map((t) => ({
        talentId: String(t.talent_id),
        name: String(t.name ?? ""),
        segments: Array.isArray(t.segments) ? (t.segments as unknown[]).map(String) : [],
        postsCount: n(t.posts_count),
        deliverablesCount: n(t.deliverables_count),
        posts: rows(t.posts).map((p) => ({ title: String(p.title ?? ""), slug: String(p.slug ?? ""), type: String(p.type ?? ""), publishedAt: String(p.published_at ?? "") })),
        deliverables: rows(t.deliverables).map((d) => ({
          title: String(d.title ?? ""),
          kind: String(d.kind ?? ""),
          network: s(d.network),
          url: s(d.url),
          publishedAt: String(d.published_at ?? ""),
          deal: String(d.deal ?? ""),
          brand: String(d.brand ?? ""),
        })),
      })),
    },
  };
}

export type PickerOption = { id: string; name: string };
export type EventOption = { id: string; title: string; day: string };

/** Opções do formulário: marcas atendidas, segmentos e Heros do casting, eventos do Calendário Groscove (‑30 a +365 dias). */
export async function strategyFormOptions(agencyId: string, today: string): Promise<{ brands: PickerOption[]; segments: PickerOption[]; talents: PickerOption[]; events: EventOption[] }> {
  const supabase = await createClient();
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86_400_000).toISOString();
  const to = new Date(Date.parse(`${today}T00:00:00Z`) + 365 * 86_400_000).toISOString();
  const [b, sg, t, e] = await Promise.all([
    supabase.from("agency_brands").select("brand:brands(id, name)").eq("agency_id", agencyId),
    supabase.from("talent_segments").select("id, name").eq("agency_id", agencyId).eq("active", true).order("sort_order").order("name"),
    supabase.from("talent_profiles").select("id, display_name").eq("agency_id", agencyId).is("archived_at", null).order("display_name").limit(500),
    supabase.from("calendar_events").select("id, title, starts_at, timezone").eq("scope", "platform").in("status", ["published", "scheduled"]).gte("starts_at", from).lt("starts_at", to).order("starts_at").limit(400),
  ]);
  const brands = ((b.data ?? []) as unknown as { brand: { id: string; name: string } | null }[])
    .map((x) => x.brand)
    .filter((x): x is { id: string; name: string } => Boolean(x))
    .map((x) => ({ id: x.id, name: x.name }))
    .sort((x, y) => x.name.localeCompare(y.name));
  const events = ((e.data ?? []) as { id: string; title: string; starts_at: string; timezone: string | null }[]).map((x) => ({
    id: x.id,
    title: x.title,
    day: new Intl.DateTimeFormat("en-CA", { timeZone: x.timezone || "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(x.starts_at)),
  }));
  return {
    brands,
    segments: ((sg.data ?? []) as { id: string; name: string }[]).map((x) => ({ id: x.id, name: x.name })),
    talents: ((t.data ?? []) as { id: string; display_name: string }[]).map((x) => ({ id: x.id, name: x.display_name })),
    events,
  };
}
