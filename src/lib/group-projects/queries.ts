import "server-only";
import { createClient } from "@/lib/supabase/server";
import { type Plan, type Priority, type ProjectStatus, type StepStatus, isPriority, isProjectStatus, isStepStatus, parsePlan } from "./format";

// Plano de projetos da Groscove (0137): lista na ordem oficial, ficha completa e a equipe (responsável e apoio).

export type ProjectRow = {
  id: string;
  number: number;
  name: string;
  category: string;
  score: number;
  priority: Priority;
  status: ProjectStatus;
  due_on: string | null;
  owner_id: string | null;
  owner: string | null;
  support_ids: string[];
  done: number;
  doing: number;
  total: number;
  updated_at: string;
};

export type ProjectStep = { stage: number; position: number; title: string; status: StepStatus; note: string; updated_at: string };
export type ProjectDetail = {
  id: string;
  number: number;
  name: string;
  category: string;
  score: number;
  priority: Priority;
  status: ProjectStatus;
  objective: string;
  plan: Plan;
  stageGoals: string[];
  ownerId: string | null;
  supportIds: string[];
  dueOn: string | null;
  notes: string;
  updatedAt: string;
  steps: ProjectStep[];
  canEdit: boolean;
  canMark: boolean;
};
export type GroupMember = { id: string; name: string; role: string };

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Os projetos na ordem oficial (null quando a pessoa não é da Groscove). */
export async function listGroupProjects(): Promise<ProjectRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("group_projects_list");
  if (error) return null;
  return arr<ProjectRow>(data)
    .filter((p) => isPriority(p.priority) && isProjectStatus(p.status))
    .map((p) => ({ ...p, score: Number(p.score), done: Number(p.done), doing: Number(p.doing), total: Number(p.total), support_ids: arr<string>(p.support_ids) }));
}

export async function loadGroupProject(number: number): Promise<ProjectDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("group_project_get", { p_number: number });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (!isPriority(d.priority) || !isProjectStatus(d.status)) return null;
  return {
    id: String(d.id),
    number: Number(d.number),
    name: String(d.name),
    category: String(d.category ?? ""),
    score: Number(d.score),
    priority: d.priority,
    status: d.status,
    objective: String(d.objective ?? ""),
    plan: parsePlan(d.plan),
    stageGoals: arr<string>(d.stage_goals),
    ownerId: typeof d.owner_id === "string" ? d.owner_id : null,
    supportIds: arr<string>(d.support_ids),
    dueOn: typeof d.due_on === "string" ? d.due_on : null,
    notes: String(d.notes ?? ""),
    updatedAt: String(d.updated_at),
    steps: arr<ProjectStep>(d.steps).filter((s) => isStepStatus(s.status)),
    canEdit: d.can_edit === true,
    canMark: d.can_mark === true,
  };
}

export async function listGroupMembers(): Promise<GroupMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("group_project_members");
  if (error) return [];
  return arr<GroupMember>(data);
}
