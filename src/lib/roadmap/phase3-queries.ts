import "server-only";
import { isInsightState, type InsightState } from "@/lib/media/insights";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { isContractCycle, type ContractCycle } from "./recurrence";
import { isSector, isStepRecurrence, type Sector, type StepRecurrence } from "./vocab";

// Leituras da Fase 3 dos roteiros (0111): contrato recorrente do negócio, nova venda (indicadores) e insights do
// publipost (agência e herói). Tudo pelas RPCs (o banco decide quem vê o quê). Sem a migração: { available: false }.

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]).filter((x) => x && typeof x === "object") : []);

// ---------------------------------------------------------------- recorrência
export type RecurrenceOccurrence = {
  id: string;
  position: number;
  title: string;
  sector: Sector | null;
  cycleNo: number;
  cycleOn: string;
  availableOn: string | null;
  dueOn: string | null;
  status: string;
  clientVisible: boolean;
  completedOn: string | null;
  late: boolean;
  assigneeName: string | null;
  canWork: boolean;
};

export type DealRecurrence = {
  today: string;
  roadmapStarted: boolean;
  eligible: boolean;
  canEdit: boolean;
  base: { position: number; title: string; recurrence: StepRecurrence | null; sector: Sector | null; dueDays: number; clientVisible: boolean }[];
  config: { cycle: ContractCycle; startsOn: string; endsOn: string | null; active: boolean; updatedLabel: string } | null;
  current: { no: number; startsOn: string; endsOn: string } | null;
  nextOn: string | null;
  occurrences: RecurrenceOccurrence[];
  stats: { cycles: number; done: number; onTime: number; lateOpen: number };
};

export async function getDealRecurrence(dealId: string): Promise<{ available: boolean; data: DealRecurrence | null }> {
  if (!/^[0-9a-f-]{36}$/i.test(dealId)) return { available: true, data: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("deal_recurrence_json", { p_deal: dealId });
  if (error) return { available: !isMissingSchema(error), data: null };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { available: true, data: null };
  const r = data as Row;
  const cfg = r.config && typeof r.config === "object" ? (r.config as Row) : null;
  const cur = r.current && typeof r.current === "object" ? (r.current as Row) : null;
  const st = r.stats && typeof r.stats === "object" ? (r.stats as Row) : {};
  return {
    available: true,
    data: {
      today: String(r.today ?? ""),
      roadmapStarted: r.roadmap_started === true,
      eligible: r.eligible === true,
      canEdit: r.can_edit === true,
      base: rows(r.base).map((x) => ({
        position: n(x.position),
        title: String(x.title ?? ""),
        recurrence: isStepRecurrence(x.recurrence) ? x.recurrence : null,
        sector: isSector(x.sector) ? x.sector : null,
        dueDays: n(x.due_days),
        clientVisible: x.client_visible === true,
      })),
      config:
        cfg && isContractCycle(cfg.cycle) && s(cfg.starts_on)
          ? { cycle: cfg.cycle, startsOn: String(cfg.starts_on), endsOn: s(cfg.ends_on), active: cfg.active !== false, updatedLabel: String(cfg.updated_label ?? "") }
          : null,
      current: cur && s(cur.starts_on) ? { no: n(cur.no), startsOn: String(cur.starts_on), endsOn: String(cur.ends_on ?? "") } : null,
      nextOn: s(r.next_on),
      occurrences: rows(r.occurrences).map((x) => ({
        id: String(x.id),
        position: n(x.position),
        title: String(x.title ?? ""),
        sector: isSector(x.sector) ? x.sector : null,
        cycleNo: n(x.cycle_no),
        cycleOn: String(x.cycle_on ?? ""),
        availableOn: s(x.available_on),
        dueOn: s(x.due_on),
        status: String(x.status ?? "todo"),
        clientVisible: x.client_visible === true,
        completedOn: s(x.completed_on),
        late: x.late === true,
        assigneeName: s(x.assignee_name),
        canWork: x.can_work === true,
      })),
      stats: { cycles: n(st.cycles), done: n(st.done), onTime: n(st.on_time), lateOpen: n(st.late_open) },
    },
  };
}

// ---------------------------------------------------------------- nova venda
export type GrowthIndicators = {
  won: number;
  withNext: number;
  linked: number;
  services: { service: string; won: number; withNext: number }[];
  recent: { id: string; title: string; originId: string; origin: string; createdAt: string }[];
};

export async function getGrowthIndicators(agencyId: string, days = 180): Promise<{ available: boolean; data: GrowthIndicators | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agency_growth_indicators", { p_agency: agencyId, p_days: days });
  if (error) return { available: !isMissingSchema(error), data: null };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { available: true, data: null };
  const r = data as Row;
  return {
    available: true,
    data: {
      won: n(r.won),
      withNext: n(r.with_next),
      linked: n(r.linked),
      services: rows(r.services).map((x) => ({ service: String(x.service ?? ""), won: n(x.won), withNext: n(x.with_next) })),
      recent: rows(r.recent).map((x) => ({ id: String(x.id), title: String(x.title ?? ""), originId: String(x.origin_id ?? ""), origin: String(x.origin ?? ""), createdAt: String(x.created_at ?? "") })),
    },
  };
}

// ---------------------------------------------------------------- insights do publipost
export type InsightItem = {
  deliverableId: string;
  dealId: string;
  dealTalentId: string | null;
  dealTitle: string;
  title: string;
  kind: string;
  network: string | null;
  talent: string;
  brand: string;
  publishedAt: string;
  publishedUrl: string | null;
  hasPrint: boolean;
  state: InsightState;
  lastMeasuredOn: string | null;
};

function toInsight(x: Row): InsightItem | null {
  if (!isInsightState(x.state)) return null;
  return {
    deliverableId: String(x.deliverable_id),
    dealId: String(x.deal_id ?? ""),
    dealTalentId: s(x.deal_talent_id),
    dealTitle: String(x.deal_title ?? ""),
    title: String(x.title ?? ""),
    kind: String(x.kind ?? ""),
    network: s(x.network),
    talent: String(x.talent ?? ""),
    brand: String(x.brand ?? ""),
    publishedAt: String(x.published_at ?? ""),
    publishedUrl: s(x.published_url),
    hasPrint: x.has_print === true,
    state: x.state,
    lastMeasuredOn: s(x.last_measured_on),
  };
}

export async function getAgencyInsights(agencyId: string): Promise<{ available: boolean; items: InsightItem[]; late: number; pending: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agency_insights_pending", { p_agency: agencyId });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return { available: !error || !isMissingSchema(error), items: [], late: 0, pending: 0 };
  const r = data as Row;
  const items = rows(r.items).map(toInsight).filter((x): x is InsightItem => x !== null);
  return { available: true, items, late: n(r.late), pending: n(r.pending) };
}

export async function getMyInsights(): Promise<{ available: boolean; items: InsightItem[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_insights_pending");
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: rows(data).map(toInsight).filter((x): x is InsightItem => x !== null) };
}
