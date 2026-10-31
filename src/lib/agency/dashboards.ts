import "server-only";
import { toSummary, type FinanceSummary } from "@/lib/finance/queries";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import type { TalentCard } from "@/lib/deals/queries";

// Painéis (0069): três leituras fechadas, uma por lado. O banco decide o escopo (colaborador só os negócios
// dele; finanças só para o Adm; marca só o que lhe foi mostrado; creator só o próprio).

export type AgencyDashboardData = {
  talentsActive: number;
  talentsNoContact: number;
  brandsActive: number;
  dealsOpen: number;
  dealsByStage: Record<string, number>;
  contractsActive: number;
  won90d: number;
  lost90d: number;
  deliverablesOverdue: number;
  approvalsPending: number;
  tasksOpen: number;
  tasksOverdue: number;
  tasksMine: number;
  events14d: number;
  finance: FinanceSummary | null;
};

export type BrandDashboardData = {
  campaignsActive: number;
  campaignsDone: number;
  approvalsPending: number;
  suggested: (TalentCard & { dealTalentId: string; requestId: string | null; dealTitle: string; talentStatus: string })[];
  nextEvents: { id: string; title: string; kind: string; startsAt: string; allDay: boolean }[];
};

export type OfficeSummaryData = {
  tasksOpen: number;
  tasksOverdue: number;
  opportunitiesPending: number;
  campaignsActive: number;
  deliverablesNext: { id: string; kind: string; title: string; dueAt: string | null; publishAt: string | null; status: string; dealTitle: string; dealTalentId: string }[];
  eventsToday: number;
  payouts: Record<string, number>;
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const counts = (v: unknown): Record<string, number> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, n]) => [k, num(n)]));
};

export async function agencyDashboardData(agencyId: string): Promise<{ available: boolean; data: AgencyDashboardData | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agency_dashboard", { p_agency: agencyId });
  if (error) return { available: !isMissingSchema(error), data: null };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { available: true, data: null };
  const k = data as Record<string, unknown>;
  return {
    available: true,
    data: {
      talentsActive: num(k.talents_active),
      talentsNoContact: num(k.talents_no_contact),
      brandsActive: num(k.brands_active),
      dealsOpen: num(k.deals_open),
      dealsByStage: counts(k.deals_by_stage),
      contractsActive: num(k.contracts_active),
      won90d: num(k.won_90d),
      lost90d: num(k.lost_90d),
      deliverablesOverdue: num(k.deliverables_overdue),
      approvalsPending: num(k.approvals_pending),
      tasksOpen: num(k.tasks_open),
      tasksOverdue: num(k.tasks_overdue),
      tasksMine: num(k.tasks_mine),
      events14d: num(k.events_14d),
      finance: Object.hasOwn(k, "finance") ? toSummary(k.finance) : null,
    },
  };
}

export async function brandDashboardData(brandId: string): Promise<{ available: boolean; data: BrandDashboardData | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_dashboard", { p_brand: brandId });
  if (error) return { available: !isMissingSchema(error), data: null };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { available: true, data: null };
  const k = data as Record<string, unknown>;
  return {
    available: true,
    data: {
      campaignsActive: num(k.campaigns_active),
      campaignsDone: num(k.campaigns_done),
      approvalsPending: num(k.approvals_pending),
      suggested: Array.isArray(k.suggested)
        ? (k.suggested as Record<string, unknown>[]).map((c) => ({
            // mesmo cartão autorizado do catálogo da marca (talent_brand_card): nome, situação, kit com consentimento
            id: String(c.id),
            name: String(c.name ?? ""),
            availability: String(c.availability ?? "unknown"),
            photoUrl: str(c.photo_url),
            headline: typeof c.headline === "string" ? c.headline : "",
            city: str(c.city),
            state: str(c.state),
            segments: Array.isArray(c.segments) ? (c.segments as { id: string; name: string }[]) : [],
            hasPublicPage: Boolean(c.has_public_page),
            heroSlug: str(c.hero_slug),
            consentMissing: Boolean(c.consent_missing),
            dealTalentId: String(c.deal_talent_id),
            requestId: str(c.request_id),
            dealTitle: String(c.deal_title ?? ""),
            talentStatus: String(c.talent_status ?? ""),
          }))
        : [],
      nextEvents: Array.isArray(k.next_events)
        ? (k.next_events as Record<string, unknown>[]).map((e) => ({ id: String(e.id), title: String(e.title ?? ""), kind: String(e.kind ?? "other"), startsAt: String(e.starts_at), allDay: Boolean(e.all_day) }))
        : [],
    },
  };
}

export async function officeSummaryData(): Promise<{ available: boolean; data: OfficeSummaryData | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("talent_office_summary");
  if (error) return { available: !isMissingSchema(error), data: null };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { available: true, data: null };
  const k = data as Record<string, unknown>;
  return {
    available: true,
    data: {
      tasksOpen: num(k.tasks_open),
      tasksOverdue: num(k.tasks_overdue),
      opportunitiesPending: num(k.opportunities_pending),
      campaignsActive: num(k.campaigns_active),
      deliverablesNext: Array.isArray(k.deliverables_next)
        ? (k.deliverables_next as Record<string, unknown>[]).map((d) => ({
            id: String(d.id), kind: String(d.kind), title: String(d.title ?? ""), dueAt: str(d.due_at), publishAt: str(d.publish_at), status: String(d.status), dealTitle: String(d.deal_title ?? ""), dealTalentId: String(d.deal_talent_id),
          }))
        : [],
      eventsToday: num(k.events_today),
      payouts: counts(k.payouts),
    },
  };
}
