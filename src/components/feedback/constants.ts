// Vocabulário do feedback (RF-022). O banco repete as mesmas listas em checks
// (0018) e na RPC submit_feedback/admin_triage_feedback; aqui ficam para a UI e o Zod.

export const FEEDBACK_CATEGORIES = ["bug", "suggestion", "content", "commerce", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export const DEFAULT_FEEDBACK_CATEGORY: FeedbackCategory = "other";

export const FEEDBACK_PRIORITIES = ["low", "medium", "high"] as const;
export type FeedbackPriority = (typeof FEEDBACK_PRIORITIES)[number];

export const FEEDBACK_STATUSES = ["new", "reviewed", "archived"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_ADMIN_NOTE_MAX = 1000;
