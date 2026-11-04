import "server-only";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import {
  isClientKind,
  isDueRule,
  isMilestone,
  isSector,
  isServiceRecurrence,
  isStepRecurrence,
  type ClientKind,
  type DueRule,
  type Milestone,
  type RoadmapStatus,
  type Sector,
  type ServiceRecurrence,
  type StepRecurrence,
  type TodayScope,
} from "./vocab";

// Leituras dos roteiros (0107). Catálogo pela RLS (membros da agência); roteiro, painel do setor, indicadores e
// projetos do herói-cliente pelas RPCs (o banco decide quem vê o quê). Sem a migração: { available: false }.

export type ServiceStep = {
  id: string;
  position: number;
  title: string;
  description: string;
  sector: Sector;
  sectorExtra: Sector | null;
  dueRule: DueRule;
  dueDays: number;
  recurrence: StepRecurrence | null;
  dependsOnPrev: boolean;
  clientVisible: boolean;
  automatic: boolean;
  milestone: Milestone | null;
};

export type Service = {
  id: string;
  slug: string;
  name: string;
  description: string;
  clientKind: ClientKind;
  recurrence: ServiceRecurrence;
  slaDays: number;
  milestoneDays: number | null;
  milestoneLabel: string;
  active: boolean;
  fromModel: boolean;
  stepCount: number;
  steps: ServiceStep[];
};

type StepRow = {
  id: string;
  position: number;
  title: string;
  description: string;
  sector: string;
  sector_extra: string | null;
  due_rule: string;
  due_days: number;
  recurrence: string | null;
  depends_on_prev: boolean;
  client_visible: boolean;
  automatic: boolean;
  milestone: string | null;
};

type ServiceRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  client_kind: string;
  recurrence: string;
  sla_days: number;
  milestone_days: number | null;
  milestone_label: string;
  active: boolean;
  from_model: boolean;
  agency_service_steps: StepRow[] | null;
};

const STEP_COLS = "id, position, title, description, sector, sector_extra, due_rule, due_days, recurrence, depends_on_prev, client_visible, automatic, milestone";
const SERVICE_COLS = "id, slug, name, description, client_kind, recurrence, sla_days, milestone_days, milestone_label, active, from_model";

function toStep(r: StepRow): ServiceStep {
  return {
    id: r.id,
    position: r.position,
    title: r.title,
    description: r.description,
    sector: isSector(r.sector) ? r.sector : "gestor",
    sectorExtra: isSector(r.sector_extra) ? r.sector_extra : null,
    dueRule: isDueRule(r.due_rule) ? r.due_rule : "business_days",
    dueDays: r.due_days,
    recurrence: isStepRecurrence(r.recurrence) ? r.recurrence : null,
    dependsOnPrev: r.depends_on_prev,
    clientVisible: r.client_visible,
    automatic: r.automatic,
    milestone: isMilestone(r.milestone) ? r.milestone : null,
  };
}

function toService(r: ServiceRow): Service {
  const steps = (r.agency_service_steps ?? []).map(toStep).sort((a, b) => a.position - b.position);
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    clientKind: isClientKind(r.client_kind) ? r.client_kind : "both",
    recurrence: isServiceRecurrence(r.recurrence) ? r.recurrence : "none",
    slaDays: r.sla_days,
    milestoneDays: r.milestone_days,
    milestoneLabel: r.milestone_label,
    active: r.active,
    fromModel: r.from_model,
    stepCount: steps.length,
    steps,
  };
}

export async function listServices(agencyId: string, opts: { activeOnly?: boolean } = {}): Promise<{ available: boolean; items: Service[] }> {
  const supabase = await createClient();
  let query = supabase.from("agency_services").select(`${SERVICE_COLS}, agency_service_steps(${STEP_COLS})`).eq("agency_id", agencyId).order("position").order("name");
  if (opts.activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: ((data ?? []) as unknown as ServiceRow[]).map(toService) };
}

export async function getService(agencyId: string, id: string): Promise<Service | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agency_services")
    .select(`${SERVICE_COLS}, agency_service_steps(${STEP_COLS})`)
    .eq("agency_id", agencyId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return toService(data as unknown as ServiceRow);
}

// ---------------------------------------------------------------- roteiro do negócio
export type RoadmapProgress = {
  service: string | null;
  startedOn: string;
  today: string;
  day: number;
  total: number | null;
  milestoneDays: number | null;
  milestoneLabel: string;
  milestoneOn: string | null;
  targetOn: string | null;
  status: RoadmapStatus;
  done: number;
  steps: number;
  forecast: string | null;
};

export type RoadmapTask = {
  id: string;
  position: number;
  title: string;
  description: string;
  sector: Sector;
  sectorExtra: Sector | null;
  dueRule: DueRule;
  dueDays: number;
  recurrence: StepRecurrence | null;
  clientVisible: boolean;
  automatic: boolean;
  milestone: Milestone | null;
  status: "todo" | "doing" | "blocked" | "done" | "cancelled";
  availableOn: string | null;
  dueOn: string | null;
  completedOn: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  late: boolean;
  canWork: boolean;
};

export type DealRoadmap = {
  service: { id: string; name: string; slaDays: number; clientKind: ClientKind } | null;
  progress: RoadmapProgress | null;
  tasks: RoadmapTask[];
  canEdit: boolean;
  canReplace: boolean;
};

const s = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function toProgress(raw: unknown): RoadmapProgress | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (!s(p.started_on) || !s(p.today)) return null;
  const status = p.status === "late" || p.status === "done" ? p.status : "on_time";
  return {
    service: s(p.service),
    startedOn: String(p.started_on),
    today: String(p.today),
    day: n(p.day) ?? 0,
    total: n(p.total),
    milestoneDays: n(p.milestone_days),
    milestoneLabel: typeof p.milestone_label === "string" ? p.milestone_label : "",
    milestoneOn: s(p.milestone_on),
    targetOn: s(p.target_on),
    status,
    done: n(p.done) ?? 0,
    steps: n(p.steps) ?? 0,
    forecast: s(p.forecast),
  };
}

function toRoadmapTask(k: Record<string, unknown>): RoadmapTask {
  const status = ["todo", "doing", "blocked", "done", "cancelled"].includes(String(k.status)) ? (k.status as RoadmapTask["status"]) : "todo";
  return {
    id: String(k.id),
    position: n(k.position) ?? 0,
    title: String(k.title ?? ""),
    description: String(k.description ?? ""),
    sector: isSector(k.sector) ? k.sector : "gestor",
    sectorExtra: isSector(k.sector_extra) ? k.sector_extra : null,
    dueRule: isDueRule(k.due_rule) ? k.due_rule : "business_days",
    dueDays: n(k.due_days) ?? 0,
    recurrence: isStepRecurrence(k.recurrence) ? k.recurrence : null,
    clientVisible: k.client_visible === true,
    automatic: k.automatic === true,
    milestone: isMilestone(k.milestone) ? k.milestone : null,
    status,
    availableOn: s(k.available_on),
    dueOn: s(k.due_on),
    completedOn: s(k.completed_on),
    assigneeId: s(k.assignee_id),
    assigneeName: s(k.assignee_name),
    late: k.late === true,
    canWork: k.can_work === true,
  };
}

export async function getDealRoadmap(dealId: string): Promise<{ available: boolean; data: DealRoadmap | null }> {
  if (!/^[0-9a-f-]{36}$/i.test(dealId)) return { available: true, data: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("deal_roadmap", { p_deal: dealId });
  if (error) return { available: !isMissingSchema(error), data: null };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { available: true, data: null };
  const raw = data as Record<string, unknown>;
  const svc = raw.service && typeof raw.service === "object" && !Array.isArray(raw.service) ? (raw.service as Record<string, unknown>) : null;
  return {
    available: true,
    data: {
      service: svc ? { id: String(svc.id), name: String(svc.name ?? ""), slaDays: n(svc.sla_days) ?? 0, clientKind: isClientKind(svc.client_kind) ? svc.client_kind : "both" } : null,
      progress: toProgress(raw.progress),
      tasks: Array.isArray(raw.tasks) ? (raw.tasks as Record<string, unknown>[]).map(toRoadmapTask) : [],
      canEdit: raw.can_edit === true,
      canReplace: raw.can_replace === true,
    },
  };
}

// ---------------------------------------------------------------- Hoje no meu setor
export type TodayItem = {
  id: string;
  bucket: "overdue" | "today" | "next";
  title: string;
  sector: Sector;
  sectorExtra: Sector | null;
  dealId: string;
  dealTitle: string;
  client: string;
  dueOn: string;
  assigneeId: string | null;
  assigneeName: string | null;
  canOpen: boolean;
};
export type SectorToday = { scope: TodayScope; sectors: Sector[]; isManager: boolean; today: string; next: string; items: TodayItem[]; month: { done: number; onTime: number } };

export async function getSectorToday(agencyId: string, scope: TodayScope): Promise<{ available: boolean; data: SectorToday | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("roadmap_today", { p_agency: agencyId, p_scope: scope });
  if (error) return { available: !isMissingSchema(error), data: null };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { available: true, data: null };
  const raw = data as Record<string, unknown>;
  const month = (raw.month ?? {}) as Record<string, unknown>;
  const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
  return {
    available: true,
    data: {
      scope: raw.scope === "mine" || raw.scope === "all" ? raw.scope : "sector",
      sectors: Array.isArray(raw.sectors) ? raw.sectors.filter(isSector) : [],
      isManager: raw.is_manager === true,
      today: String(raw.today ?? ""),
      next: String(raw.next ?? ""),
      items: items.map((x) => ({
        id: String(x.id),
        bucket: x.bucket === "overdue" || x.bucket === "today" ? x.bucket : "next",
        title: String(x.title ?? ""),
        sector: isSector(x.sector) ? x.sector : "gestor",
        sectorExtra: isSector(x.sector_extra) ? x.sector_extra : null,
        dealId: String(x.deal_id),
        dealTitle: String(x.deal_title ?? ""),
        client: String(x.client ?? ""),
        dueOn: String(x.due_on ?? ""),
        assigneeId: s(x.assignee_id),
        assigneeName: s(x.assignee_name),
        canOpen: x.can_open === true,
      })),
      month: { done: n(month.done) ?? 0, onTime: n(month.on_time) ?? 0 },
    },
  };
}

// ---------------------------------------------------------------- indicadores (gestor+)
export type SectorStat = { sector: Sector; done: number; onTime: number; lateDone: number; lateOpen: number; avgDays: number | null };
export type RoadmapIndicators = {
  from: string;
  done: number;
  onTime: number;
  lateOpen: number;
  avgDays: number | null;
  sectors: SectorStat[];
  worstSector: Sector | null;
  slowestSteps: { service: string; title: string; count: number; avgDays: number }[];
  services: { service: string; done: number; onTime: number }[];
};

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

export async function getRoadmapIndicators(agencyId: string, days = 90): Promise<{ available: boolean; data: RoadmapIndicators | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("roadmap_indicators", { p_agency: agencyId, p_days: days });
  if (error) return { available: !isMissingSchema(error), data: null };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { available: true, data: null };
  const raw = data as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  return {
    available: true,
    data: {
      from: String(raw.from ?? ""),
      done: num(raw.done) ?? 0,
      onTime: num(raw.on_time) ?? 0,
      lateOpen: num(raw.late_open) ?? 0,
      avgDays: num(raw.avg_days),
      sectors: list(raw.sectors)
        .filter((x) => isSector(x.sector))
        .map((x) => ({ sector: x.sector as Sector, done: num(x.done) ?? 0, onTime: num(x.on_time) ?? 0, lateDone: num(x.late_done) ?? 0, lateOpen: num(x.late_open) ?? 0, avgDays: num(x.avg_days) })),
      worstSector: isSector(raw.worst_sector) ? raw.worst_sector : null,
      slowestSteps: list(raw.slowest_steps).map((x) => ({ service: String(x.service ?? ""), title: String(x.title ?? ""), count: num(x.count) ?? 0, avgDays: num(x.avg_days) ?? 0 })),
      services: list(raw.services).map((x) => ({ service: String(x.service ?? ""), done: num(x.done) ?? 0, onTime: num(x.on_time) ?? 0 })),
    },
  };
}

// ---------------------------------------------------------------- projetos do herói-cliente
export type ClientProject = {
  dealId: string;
  title: string;
  agency: string;
  brand: string | null;
  closed: boolean;
  progress: RoadmapProgress | null;
  steps: { title: string; dueOn: string | null; done: boolean; completedOn: string | null; milestone: Milestone | null }[];
};

export async function getClientProjects(): Promise<{ available: boolean; items: ClientProject[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("client_projects");
  if (error) return { available: !isMissingSchema(error), items: [] };
  if (!Array.isArray(data)) return { available: true, items: [] };
  return {
    available: true,
    items: (data as Record<string, unknown>[]).map((p) => ({
      dealId: String(p.deal_id),
      title: String(p.title ?? ""),
      agency: String(p.agency ?? ""),
      brand: s(p.brand),
      closed: p.closed === true,
      progress: toProgress(p.progress),
      steps: Array.isArray(p.steps)
        ? (p.steps as Record<string, unknown>[]).map((x) => ({ title: String(x.title ?? ""), dueOn: s(x.due_on), done: x.done === true, completedOn: s(x.completed_on), milestone: isMilestone(x.milestone) ? x.milestone : null }))
        : [],
    })),
  };
}

// ---------------------------------------------------------------- setores da equipe
/** Setores de cada membro ativo (userId → setores). Sem a 0107: mapa vazio (as telas seguem sem setores). */
export async function listTeamSectors(agencyId: string): Promise<Map<string, Sector[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("agency_members").select("user_id, sectors").eq("agency_id", agencyId).is("revoked_at", null);
  const out = new Map<string, Sector[]>();
  if (error || !data) return out;
  for (const row of data as { user_id: string; sectors: string[] | null }[]) out.set(row.user_id, (row.sectors ?? []).filter(isSector));
  return out;
}
