import { describe, expect, it } from "vitest";
import { DEFAULT_FEEDBACK_CATEGORY, FEEDBACK_ADMIN_NOTE_MAX, FEEDBACK_CATEGORIES, FEEDBACK_PRIORITIES, FEEDBACK_STATUSES } from "@/components/feedback/constants";
import { feedbackCategorySchema, feedbackPrioritySchema, feedbackTriagePatchSchema, feedbackTriageSchema, submitFeedbackSchema } from "@/components/feedback/schema";

// Feedback (RF-022): categoria/prioridade validadas no app com as mesmas listas dos checks do banco (0018).

const ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ADMIN = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";

describe("feedbackCategorySchema", () => {
  it("aceita exatamente as cinco categorias do check do banco", () => {
    expect([...FEEDBACK_CATEGORIES]).toEqual(["bug", "suggestion", "content", "commerce", "other"]);
    for (const value of FEEDBACK_CATEGORIES) expect(feedbackCategorySchema.safeParse(value).success).toBe(true);
  });

  it("recusa valores fora da lista, incluindo variações de caixa e espaços", () => {
    for (const value of ["spam", "Bug", " bug", "", null, undefined, 1]) expect(feedbackCategorySchema.safeParse(value).success).toBe(false);
  });
});

describe("feedbackPrioritySchema", () => {
  it("aceita baixa, média e alta", () => {
    expect([...FEEDBACK_PRIORITIES]).toEqual(["low", "medium", "high"]);
    for (const value of FEEDBACK_PRIORITIES) expect(feedbackPrioritySchema.safeParse(value).success).toBe(true);
  });

  it("recusa outros valores", () => {
    for (const value of ["urgent", "HIGH", "", null, 2]) expect(feedbackPrioritySchema.safeParse(value).success).toBe(false);
  });
});

describe("submitFeedbackSchema (widget)", () => {
  it("categoria é opcional e cai em 'other' (um toque ainda basta)", () => {
    const parsed = submitFeedbackSchema.safeParse({ context: "content:abc", rating: 5 });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({ context: "content:abc", rating: 5, message: "", category: DEFAULT_FEEDBACK_CATEGORY });
  });

  it("aceita categoria explícita e apara o comentário", () => {
    const parsed = submitFeedbackSchema.safeParse({ context: "page:/explore", rating: 3, message: "  falta filtro  ", category: "suggestion" });
    expect(parsed.success && parsed.data).toEqual({ context: "page:/explore", rating: 3, message: "falta filtro", category: "suggestion" });
  });

  it("recusa categoria inválida, nota fora de 1–5 e comentário acima de 1000 caracteres", () => {
    expect(submitFeedbackSchema.safeParse({ context: "page:/", rating: 4, category: "spam" }).success).toBe(false);
    expect(submitFeedbackSchema.safeParse({ context: "page:/", rating: 0 }).success).toBe(false);
    expect(submitFeedbackSchema.safeParse({ context: "page:/", rating: 6 }).success).toBe(false);
    expect(submitFeedbackSchema.safeParse({ context: "page:/", rating: 4.5 }).success).toBe(false);
    expect(submitFeedbackSchema.safeParse({ context: "page:/", rating: 4, message: "x".repeat(1001) }).success).toBe(false);
    expect(submitFeedbackSchema.safeParse({ context: "", rating: 4 }).success).toBe(false);
  });
});

describe("feedbackTriageSchema (admin)", () => {
  it("aceita status, prioridade, responsável e nota; null limpa prioridade, responsável e nota", () => {
    const parsed = feedbackTriageSchema.safeParse({ id: ID, patch: { status: "reviewed", priority: "high", assignee: ADMIN, admin_note: "  verificar  " } });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.patch).toEqual({ status: "reviewed", priority: "high", assignee: ADMIN, admin_note: "verificar" });
    const cleared = feedbackTriagePatchSchema.safeParse({ priority: null, assignee: null, admin_note: null });
    expect(cleared.success && cleared.data).toEqual({ priority: null, assignee: null, admin_note: null });
  });

  it("só as chaves presentes entram no patch", () => {
    const parsed = feedbackTriagePatchSchema.safeParse({ status: "archived" });
    expect(parsed.success && Object.keys(parsed.data)).toEqual(["status"]);
    expect(FEEDBACK_STATUSES).toContain("archived");
  });

  it("recusa patch vazio, chave desconhecida e valores inválidos", () => {
    expect(feedbackTriagePatchSchema.safeParse({}).success).toBe(false);
    expect(feedbackTriagePatchSchema.safeParse({ user_id: ADMIN }).success).toBe(false);
    expect(feedbackTriagePatchSchema.safeParse({ status: "done" }).success).toBe(false);
    expect(feedbackTriagePatchSchema.safeParse({ priority: "urgent" }).success).toBe(false);
    expect(feedbackTriagePatchSchema.safeParse({ assignee: "not-a-uuid" }).success).toBe(false);
    expect(feedbackTriagePatchSchema.safeParse({ admin_note: "x".repeat(FEEDBACK_ADMIN_NOTE_MAX + 1) }).success).toBe(false);
    expect(feedbackTriagePatchSchema.safeParse({ admin_note: "x".repeat(FEEDBACK_ADMIN_NOTE_MAX) }).success).toBe(true);
  });

  it("recusa id inválido e justificativa longa demais", () => {
    expect(feedbackTriageSchema.safeParse({ id: "123", patch: { status: "new" } }).success).toBe(false);
    expect(feedbackTriageSchema.safeParse({ id: ID, patch: { status: "new" }, justification: "j".repeat(501) }).success).toBe(false);
    expect(feedbackTriageSchema.safeParse({ id: ID, patch: { status: "new" }, justification: "triagem" }).success).toBe(true);
  });
});
