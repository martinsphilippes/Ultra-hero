import { z } from "zod";
import { DELIVERABLE_STATUSES, type DeliverableStatus } from "@/lib/deals/vocab";

// Execução (0068): listas fechadas iguais aos checks do banco e formas dos formulários.
export const TASK_STATUSES = ["todo", "doing", "blocked", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TERMS_STATUSES = ["draft", "sent", "accepted", "superseded", "withdrawn"] as const;
export type TermsStatus = (typeof TERMS_STATUSES)[number];
export const TASK_SIDES = ["agency", "talent", "brand"] as const;
/** Passos do modelo (D12): 1..12; títulos em commercial.taskSteps.<n>. */
export const TASK_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
/** Passos que só mudam pela decisão (roteiro: 5; conteúdo: 8). */
export const DECISION_STEPS: readonly number[] = [5, 8];
/** Passos que exigem anexo para concluir. */
export const ATTACHMENT_STEPS: readonly number[] = [4, 7];

export type { DeliverableStatus };
export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}
export function isDeliverableStatus(value: unknown): value is DeliverableStatus {
  return typeof value === "string" && (DELIVERABLE_STATUSES as readonly string[]).includes(value);
}

const uuid = z.uuid();
const httpsUrl = z.string().trim().url().max(500).refine((u) => u.startsWith("https://"), "https");
const optionalUrl = z.union([z.literal(""), httpsUrl]);

export const termsSchema = z.object({ dealId: uuid, summary: z.string().trim().min(20).max(4000), usageRights: z.string().trim().max(1000), exclusivity: z.string().trim().max(1000), validUntil: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]) });
export const acceptSchema = z.object({ termsId: uuid, note: z.string().trim().max(500) });
export const recordAcceptanceSchema = z.object({ termsId: uuid, party: z.enum(["brand", "talent"]), dealTalentId: z.union([z.literal(""), uuid]), documentId: z.union([z.literal(""), uuid]), note: z.string().trim().min(5).max(500) });
export const taskSaveSchema = z.object({
  id: uuid.nullable(),
  agencyId: uuid,
  dealId: z.union([z.literal(""), uuid]),
  talentId: z.union([z.literal(""), uuid]),
  title: z.string().trim().max(160),
  description: z.string().trim().max(2000),
  // avulsa nunca é do lado da marca (os passos 5 e 8 só vêm do modelo)
  side: z.enum(["agency", "talent"]),
  assigneeId: z.union([z.literal(""), uuid]),
  dueDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
});
export type TaskSaveInput = z.input<typeof taskSaveSchema>;
export const taskStatusSchema = z.object({ taskId: uuid, status: z.enum(TASK_STATUSES), url: optionalUrl, documentId: z.union([z.literal(""), uuid]) });
export const taskDecideSchema = z.object({ taskId: uuid, decision: z.enum(["approve", "changes"]), feedback: z.string().trim().max(1000) });
export const submitSchema = z.object({ deliverableId: uuid, url: optionalUrl, documentId: z.union([z.literal(""), uuid]), note: z.string().trim().max(1000) });
export const decideSchema = z.object({ deliverableId: uuid, decision: z.enum(["approved", "changes_requested"]), feedback: z.string().trim().max(1000) });
export const publishSchema = z.object({ deliverableId: uuid, url: httpsUrl });
export const closeSchema = z.object({ deliverableId: uuid, status: z.enum(["done", "cancelled"]), note: z.string().trim().max(500) });

/** Próxima ação natural de uma entrega para quem lê (texto da UI; o banco decide de verdade). */
export function deliverableNextAction(status: DeliverableStatus, side: "agency" | "brand" | "talent"): "submit" | "decide" | "publish" | "proof" | "close" | null {
  if (side === "brand") return status === "submitted" ? "decide" : null;
  if (["planned", "in_production", "changes_requested"].includes(status)) return "submit";
  if (status === "submitted") return side === "agency" ? "decide" : null;
  if (status === "approved") return "publish";
  if (status === "published") return "proof";
  if (status === "proof_submitted") return side === "agency" ? "close" : "proof";
  return null;
}
