import { z } from "zod";
import { CLIENT_KINDS, DUE_RULES, MILESTONES, SECTORS, SERVICE_RECURRENCES, STEP_RECURRENCES } from "./vocab";

// Formas dos formulários dos roteiros (0107). O banco confere de novo (checks e RPCs).

const uuid = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const serviceStepSchema = z
  .object({
    id: z.union([z.literal(""), uuid]).optional(),
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().max(1000),
    sector: z.enum(SECTORS),
    sectorExtra: z.union([z.literal(""), z.enum(SECTORS)]),
    dueRule: z.enum(DUE_RULES),
    dueDays: z.number().int().min(0).max(120),
    recurrence: z.union([z.literal(""), z.enum(STEP_RECURRENCES)]),
    dependsOnPrev: z.boolean(),
    clientVisible: z.boolean(),
    automatic: z.boolean(),
    milestone: z.union([z.literal(""), z.enum(MILESTONES)]),
  })
  .refine((s) => s.sectorExtra === "" || s.sectorExtra !== s.sector, { path: ["sectorExtra"] })
  .refine((s) => (s.dueRule === "same_day" ? true : s.dueDays >= 1), { path: ["dueDays"] })
  .refine((s) => (s.dueRule === "recurring" ? s.recurrence !== "" : true), { path: ["recurrence"] });
export type ServiceStepInput = z.infer<typeof serviceStepSchema>;

export const serviceSaveSchema = z
  .object({
    id: z.union([z.literal(""), uuid]),
    name: z.string().trim().min(3).max(80),
    description: z.string().trim().max(1000),
    clientKind: z.enum(CLIENT_KINDS),
    recurrence: z.enum(SERVICE_RECURRENCES),
    slaDays: z.number().int().min(1).max(365),
    milestoneDays: z.number().int().min(1).max(365).nullable(),
    milestoneLabel: z.string().trim().max(60),
    active: z.boolean(),
    steps: z.array(serviceStepSchema).min(1).max(60),
  })
  .strict();
export type ServiceSaveInput = z.infer<typeof serviceSaveSchema>;

/** Payload da RPC agency_service_save (snake_case; a regra "mesmo dia" leva 0 dias, sem recorrência). */
export function toServicePayload(input: ServiceSaveInput): Record<string, unknown> {
  return {
    name: input.name,
    description: input.description,
    client_kind: input.clientKind,
    recurrence: input.recurrence,
    sla_days: input.slaDays,
    milestone_days: input.milestoneDays ?? "",
    milestone_label: input.milestoneLabel,
    active: input.active,
    steps: input.steps.map((s) => ({
      id: s.id ?? "",
      title: s.title,
      description: s.description,
      sector: s.sector,
      sector_extra: s.sectorExtra,
      due_rule: s.dueRule,
      due_days: s.dueRule === "same_day" ? 0 : s.dueDays,
      recurrence: s.dueRule === "recurring" ? s.recurrence : "",
      depends_on_prev: s.dependsOnPrev,
      client_visible: s.clientVisible,
      automatic: s.automatic,
      milestone: s.milestone,
    })),
  };
}

export const sectorsSchema = z.object({ userId: uuid, sectors: z.array(z.enum(SECTORS)).max(4) });

export const roadmapStartSchema = z.object({ dealId: uuid, serviceId: uuid, startOn: z.union([z.literal(""), isoDate]), replace: z.boolean() });

export const roadmapTaskSchema = z.object({ taskId: uuid, done: z.boolean() });

export const roadmapAssignSchema = z.object({ taskId: uuid, assigneeId: z.union([z.literal(""), uuid]), sector: z.enum(SECTORS) });

export const dealClientSchema = z.object({ dealId: uuid, talentId: z.union([z.literal(""), uuid]) });
