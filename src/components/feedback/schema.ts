import { z } from "zod";
import { DEFAULT_FEEDBACK_CATEGORY, FEEDBACK_ADMIN_NOTE_MAX, FEEDBACK_CATEGORIES, FEEDBACK_PRIORITIES, FEEDBACK_STATUSES } from "./constants";

// Validação compartilhada do feedback (widget e triagem do admin). O banco confere de novo:
// checks de categoria/prioridade/nota (0018) e as regras das RPCs submit_feedback e admin_triage_feedback.

export const feedbackCategorySchema = z.enum(FEEDBACK_CATEGORIES);
export const feedbackPrioritySchema = z.enum(FEEDBACK_PRIORITIES);
export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES);

// Envio pelo widget: nota 1–5, comentário opcional, categoria com padrão "other" (um toque ainda basta).
export const submitFeedbackSchema = z.object({
  context: z.string().trim().min(1).max(120),
  rating: z.number().int().min(1).max(5),
  message: z.string().trim().max(1000).default(""),
  category: feedbackCategorySchema.default(DEFAULT_FEEDBACK_CATEGORY),
});
export type SubmitFeedbackInput = z.input<typeof submitFeedbackSchema>;

// Triagem pelo admin: só as chaves presentes mudam; null limpa prioridade, responsável ou nota.
export const feedbackTriagePatchSchema = z
  .object({
    status: feedbackStatusSchema.optional(),
    priority: feedbackPrioritySchema.nullable().optional(),
    assignee: z.uuid().nullable().optional(),
    admin_note: z.string().trim().max(FEEDBACK_ADMIN_NOTE_MAX).nullable().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: "empty_patch" });

export const feedbackTriageSchema = z.object({
  id: z.uuid(),
  patch: feedbackTriagePatchSchema,
  justification: z.string().trim().max(500).optional(),
});
export type FeedbackTriagePatch = z.infer<typeof feedbackTriagePatchSchema>;
export type FeedbackTriageInput = z.input<typeof feedbackTriageSchema>;
