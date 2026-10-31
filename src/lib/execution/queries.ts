import "server-only";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { isDeliverableStatus, isTaskStatus, type DeliverableStatus, type TaskStatus, type TermsStatus } from "./vocab";

// Execução da campanha (0068): termos, tarefas e entregas com versões, pela leitura fechada deal_execution
// (o banco decide o lado: agência, marca ou creator, e filtra o que cada um vê). Tarefas da pessoa: RLS.

export type Acceptance = { party: "brand" | "talent"; dealTalentId: string | null; method: "in_app" | "recorded_by_agency"; acceptedAt: string; talentName: string | null };
export type Terms = { id: string; version: number; status: TermsStatus; summary: string; usageRights: string; exclusivity: string; validUntil: string | null; sentAt: string | null; acceptances: Acceptance[] };
export type Task = {
  id: string;
  step: number | null;
  title: string;
  description: string;
  side: "agency" | "talent" | "brand";
  status: TaskStatus;
  dueAt: string | null;
  completedAt: string | null;
  talentId: string | null;
  talentName: string | null;
  attachmentUrl: string | null;
  attachmentDocumentId: string | null;
  feedback: string;
  assigneeId?: string | null;
  dealId?: string | null;
  dealTitle?: string | null;
};
export type DeliverableVersion = {
  id: string;
  revision: number;
  kind: "submission" | "proof";
  url: string | null;
  documentId: string | null;
  note: string;
  submittedSide: "talent" | "agency";
  submittedAt: string;
  decision: "approved" | "changes_requested" | null;
  feedback: string;
  decidedSide: "brand" | "agency" | null;
  decidedAt: string | null;
};
export type ExecDeliverable = {
  id: string;
  dealTalentId: string;
  talentName: string;
  kind: string;
  network: string | null;
  title: string;
  brief: string;
  dueAt: string | null;
  publishAt: string | null;
  status: DeliverableStatus;
  revision: number;
  submissionUrl: string | null;
  submissionDocumentId: string | null;
  submissionNote: string;
  submittedAt: string | null;
  brandFeedback: string;
  decidedAt: string | null;
  decidedSide: string | null;
  publishedUrl: string | null;
  publishedAt: string | null;
  proofUrl: string | null;
  proofDocumentId: string | null;
  proofAt: string | null;
  versions: DeliverableVersion[];
};
export type DealExecution = { side: "agency" | "brand" | "talent"; stage: string; contractConfirmedAt: string | null; terms: Terms[]; tasks: Task[]; deliverables: ExecDeliverable[] };

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

function toTask(k: Record<string, unknown>): Task {
  return {
    id: String(k.id),
    step: typeof k.step === "number" ? k.step : k.template_step && typeof k.template_step === "number" ? k.template_step : null,
    title: String(k.title ?? ""),
    description: String(k.description ?? ""),
    side: (k.side as Task["side"]) ?? "agency",
    status: isTaskStatus(k.status) ? k.status : "todo",
    dueAt: str(k.due_at),
    completedAt: str(k.completed_at),
    talentId: str(k.talent_id),
    talentName: str(k.talent_name),
    attachmentUrl: str(k.attachment_url),
    attachmentDocumentId: str(k.attachment_document_id),
    feedback: String(k.feedback ?? ""),
    assigneeId: k.assignee_id === undefined ? undefined : str(k.assignee_id),
  };
}

export async function getDealExecution(dealId: string): Promise<{ available: boolean; data: DealExecution | null }> {
  if (!/^[0-9a-f-]{36}$/i.test(dealId)) return { available: true, data: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("deal_execution", { p_deal: dealId });
  if (error) return { available: !isMissingSchema(error), data: null };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { available: true, data: null };
  const raw = data as Record<string, unknown>;
  return {
    available: true,
    data: {
      side: raw.side as DealExecution["side"],
      stage: String(raw.stage),
      contractConfirmedAt: str(raw.contract_confirmed_at),
      terms: Array.isArray(raw.terms)
        ? (raw.terms as Record<string, unknown>[]).map((t) => ({
            id: String(t.id),
            version: Number(t.version),
            status: t.status as TermsStatus,
            summary: String(t.summary ?? ""),
            usageRights: String(t.usage_rights ?? ""),
            exclusivity: String(t.exclusivity ?? ""),
            validUntil: str(t.valid_until),
            sentAt: str(t.sent_at),
            acceptances: Array.isArray(t.acceptances)
              ? (t.acceptances as Record<string, unknown>[]).map((a) => ({ party: a.party as Acceptance["party"], dealTalentId: str(a.deal_talent_id), method: a.method as Acceptance["method"], acceptedAt: String(a.accepted_at), talentName: str(a.talent_name) }))
              : [],
          }))
        : [],
      tasks: Array.isArray(raw.tasks) ? (raw.tasks as Record<string, unknown>[]).map(toTask) : [],
      deliverables: Array.isArray(raw.deliverables)
        ? (raw.deliverables as Record<string, unknown>[]).map((x) => ({
            id: String(x.id),
            dealTalentId: String(x.deal_talent_id),
            talentName: String(x.talent_name ?? ""),
            kind: String(x.kind),
            network: str(x.network),
            title: String(x.title ?? ""),
            brief: String(x.brief ?? ""),
            dueAt: str(x.due_at),
            publishAt: str(x.publish_at),
            status: isDeliverableStatus(x.status) ? x.status : "planned",
            revision: Number(x.revision ?? 0),
            submissionUrl: str(x.submission_url),
            submissionDocumentId: str(x.submission_document_id),
            submissionNote: String(x.submission_note ?? ""),
            submittedAt: str(x.submitted_at),
            brandFeedback: String(x.brand_feedback ?? ""),
            decidedAt: str(x.decided_at),
            decidedSide: str(x.decided_side),
            publishedUrl: str(x.published_url),
            publishedAt: str(x.published_at),
            proofUrl: str(x.proof_url),
            proofDocumentId: str(x.proof_document_id),
            proofAt: str(x.proof_at),
            versions: Array.isArray(x.versions)
              ? (x.versions as Record<string, unknown>[]).map((v) => ({
                  id: String(v.id),
                  revision: Number(v.revision),
                  kind: v.kind as DeliverableVersion["kind"],
                  url: str(v.url),
                  documentId: str(v.document_id),
                  note: String(v.note ?? ""),
                  submittedSide: v.submitted_side as DeliverableVersion["submittedSide"],
                  submittedAt: String(v.submitted_at),
                  decision: (v.decision as DeliverableVersion["decision"]) ?? null,
                  feedback: String(v.feedback ?? ""),
                  decidedSide: (v.decided_side as DeliverableVersion["decidedSide"]) ?? null,
                  decidedAt: str(v.decided_at),
                }))
              : [],
          }))
        : [],
    },
  };
}

export type TaskFilters = { agencyId?: string; mine?: string; overdue?: boolean; open?: boolean; talentOnly?: boolean };

/** Tarefas pela RLS (agência: /agencia/tarefas; creator: as dele). Com o título do negócio quando houver. */
export async function listTasks(filters: TaskFilters = {}): Promise<{ available: boolean; items: Task[] }> {
  const supabase = await createClient();
  let query = supabase
    .from("tasks")
    .select("id, template_step, title, description, side, status, due_at, completed_at, talent_id, deal_id, assignee_id, attachment_url, attachment_document_id, feedback, deal:deals!tasks_deal_fk(title), talent:talent_profiles!tasks_talent_fk(display_name)")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(300);
  if (filters.agencyId) query = query.eq("agency_id", filters.agencyId);
  if (filters.mine && /^[0-9a-f-]{36}$/i.test(filters.mine)) query = query.eq("assignee_id", filters.mine);
  if (filters.talentOnly) query = query.eq("side", "talent");
  if (filters.open) query = query.in("status", ["todo", "doing", "blocked"]);
  if (filters.overdue) query = query.in("status", ["todo", "doing", "blocked"]).lt("due_at", new Date().toISOString());
  const { data, error } = await query;
  if (error) return { available: !isMissingSchema(error), items: [] };
  type Row = Record<string, unknown> & { deal: { title: string } | null; talent: { display_name: string } | null };
  return {
    available: true,
    items: ((data ?? []) as unknown as Row[]).map((k) => ({ ...toTask({ ...k, step: k.template_step, talent_name: k.talent?.display_name ?? null }), dealId: str(k.deal_id), dealTitle: k.deal?.title ?? null })),
  };
}

export async function taskCounts(agencyId: string, userId: string | null): Promise<{ open: number; mine: number; overdue: number } | null> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const open = supabase.from("tasks").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).in("status", ["todo", "doing", "blocked"]);
  const [a, b, c] = await Promise.all([
    open,
    userId ? supabase.from("tasks").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).in("status", ["todo", "doing", "blocked"]).eq("assignee_id", userId) : Promise.resolve({ count: 0, error: null }),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).in("status", ["todo", "doing", "blocked"]).lt("due_at", now),
  ]);
  if (a.error) return null;
  return { open: a.count ?? 0, mine: b.count ?? 0, overdue: c.count ?? 0 };
}
