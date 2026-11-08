"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PLAN_FIELDS, PRIORITIES, PROJECT_STATUSES, STEP_STATUSES } from "./format";

// Plano de projetos da Groscove (0137): gestor+ edita a ficha; responsável, apoio e gestor+ marcam as microetapas.

type Result = { ok: true } | { ok: false; error: string };
const BASE = "/agencia/plano-de-projetos";

const planSchema = z.object(Object.fromEntries(PLAN_FIELDS.map((f) => [f, z.string().trim().max(1000)])) as Record<(typeof PLAN_FIELDS)[number], z.ZodString>).partial();

const saveSchema = z.object({
  id: z.uuid(),
  number: z.number().int().min(1).max(999),
  data: z
    .object({
      name: z.string().trim().min(2).max(120),
      category: z.string().trim().max(80),
      score: z.number().min(0).max(5),
      priority: z.enum(PRIORITIES),
      status: z.enum(PROJECT_STATUSES),
      objective: z.string().trim().max(1000),
      notes: z.string().trim().max(2000),
      plan: planSchema,
      stage_goals: z.array(z.string().trim().max(300)).length(5),
      due_on: z.union([z.iso.date(), z.literal("")]),
      owner_id: z.union([z.uuid(), z.literal("")]),
      support_ids: z.array(z.uuid()).max(10),
    })
    .partial(),
});

export async function saveGroupProjectAction(input: z.input<typeof saveSchema>): Promise<Result> {
  await requireUser(BASE);
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("group_project_save", { p_id: parsed.data.id, p_data: parsed.data.data as never });
  if (error) return agencyFail(error);
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${parsed.data.number}`);
  return { ok: true };
}

const stepSchema = z.object({
  projectId: z.uuid(),
  number: z.number().int().min(1).max(999),
  stage: z.number().int().min(1).max(5),
  position: z.number().int().min(1).max(6),
  status: z.enum(STEP_STATUSES),
  note: z.string().trim().max(500),
});

export async function setGroupProjectStepAction(input: z.input<typeof stepSchema>): Promise<Result> {
  await requireUser(BASE);
  const parsed = stepSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("group_project_step_set", { p_project: d.projectId, p_stage: d.stage, p_position: d.position, p_status: d.status, p_note: d.note });
  if (error) return agencyFail(error);
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${d.number}`);
  return { ok: true };
}
