import { describe, expect, it } from "vitest";
import { AGENCY_ERROR_CODES, agencyErrorCode } from "@/lib/agency/error-codes";
import { AGENCY_NAV, agencyNavKeys } from "@/lib/agency/roles";
import { ATTACHMENT_STEPS, DECISION_STEPS, TASK_STEPS, closeSchema, deliverableNextAction, publishSchema, recordAcceptanceSchema, submitSchema, taskSaveSchema, taskStatusSchema, termsSchema } from "@/lib/execution/vocab";
import { talentErrorCode } from "@/lib/talent/error-codes";

// P2 (0068): regras puras da execução — próxima ação por lado, formas dos formulários, passos do modelo,
// códigos de erro e a entrada Tarefas no menu da agência.

describe("próxima ação da entrega", () => {
  it("creator: envia, publica, comprova; não avalia", () => {
    expect(deliverableNextAction("planned", "talent")).toBe("submit");
    expect(deliverableNextAction("in_production", "talent")).toBe("submit");
    expect(deliverableNextAction("changes_requested", "talent")).toBe("submit");
    expect(deliverableNextAction("submitted", "talent")).toBeNull();
    expect(deliverableNextAction("approved", "talent")).toBe("publish");
    expect(deliverableNextAction("published", "talent")).toBe("proof");
    expect(deliverableNextAction("proof_submitted", "talent")).toBe("proof");
    expect(deliverableNextAction("done", "talent")).toBeNull();
    expect(deliverableNextAction("cancelled", "talent")).toBeNull();
  });

  it("marca: só avalia o que foi enviado", () => {
    expect(deliverableNextAction("submitted", "brand")).toBe("decide");
    for (const s of ["planned", "in_production", "changes_requested", "approved", "published", "proof_submitted", "done", "cancelled"] as const) expect(deliverableNextAction(s, "brand")).toBeNull();
  });

  it("agência: age pelo creator, avalia com nota e conclui", () => {
    expect(deliverableNextAction("in_production", "agency")).toBe("submit");
    expect(deliverableNextAction("submitted", "agency")).toBe("decide");
    expect(deliverableNextAction("approved", "agency")).toBe("publish");
    expect(deliverableNextAction("proof_submitted", "agency")).toBe("close");
    expect(deliverableNextAction("done", "agency")).toBeNull();
  });
});

describe("modelo de 12 passos", () => {
  it("passos, decisões e anexos", () => {
    expect(TASK_STEPS).toHaveLength(12);
    expect(DECISION_STEPS).toEqual([5, 8]);
    expect(ATTACHMENT_STEPS).toEqual([4, 7]);
  });
});

describe("formas dos formulários", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("termos: condições com ao menos 20 caracteres e validade opcional", () => {
    expect(termsSchema.safeParse({ dealId: id, summary: "curto", usageRights: "", exclusivity: "", validUntil: "" }).success).toBe(false);
    expect(termsSchema.safeParse({ dealId: id, summary: "Dois reels e três stories em novembro.", usageRights: "", exclusivity: "", validUntil: "2026-12-31" }).success).toBe(true);
    expect(termsSchema.safeParse({ dealId: id, summary: "Dois reels e três stories em novembro.", usageRights: "", exclusivity: "", validUntil: "31/12/2026" }).success).toBe(false);
  });
  it("aceite registrado pela agência exige como chegou", () => {
    expect(recordAcceptanceSchema.safeParse({ termsId: id, party: "brand", dealTalentId: "", documentId: "", note: "ok" }).success).toBe(false);
    expect(recordAcceptanceSchema.safeParse({ termsId: id, party: "talent", dealTalentId: id, documentId: "", note: "e-mail de 12/11" }).success).toBe(true);
  });
  it("links só https; publicação exige link", () => {
    expect(publishSchema.safeParse({ deliverableId: id, url: "http://x.com/post" }).success).toBe(false);
    expect(publishSchema.safeParse({ deliverableId: id, url: "" }).success).toBe(false);
    expect(publishSchema.safeParse({ deliverableId: id, url: "https://x.com/post" }).success).toBe(true);
    expect(submitSchema.safeParse({ deliverableId: id, url: "", documentId: "", note: "" }).success).toBe(true);
    expect(submitSchema.safeParse({ deliverableId: id, url: "javascript:alert(1)", documentId: "", note: "" }).success).toBe(false);
    expect(taskStatusSchema.safeParse({ taskId: id, status: "done", url: "ftp://x", documentId: "" }).success).toBe(false);
    expect(taskStatusSchema.safeParse({ taskId: id, status: "paused", url: "", documentId: "" }).success).toBe(false);
  });
  it("tarefa avulsa: id nulo na criação, lado fechado, prazo em data", () => {
    const base = { id: null, agencyId: id, dealId: "", talentId: "", title: "Enviar contrato", description: "", side: "agency", assigneeId: "", dueDate: "" };
    expect(taskSaveSchema.safeParse(base).success).toBe(true);
    expect(taskSaveSchema.safeParse({ ...base, side: "client" }).success).toBe(false);
    expect(taskSaveSchema.safeParse({ ...base, dueDate: "amanhã" }).success).toBe(false);
    expect(closeSchema.safeParse({ deliverableId: id, status: "archived", note: "" }).success).toBe(false);
  });
});

describe("códigos de erro e menu", () => {
  it("novos códigos da execução", () => {
    expect(AGENCY_ERROR_CODES).toContain("terms_missing");
    expect(AGENCY_ERROR_CODES).toContain("acceptance_missing");
    expect(agencyErrorCode(new Error("P0001: acceptance_missing"))).toBe("acceptance_missing");
    expect(talentErrorCode(new Error("file_missing"))).toBe("file_missing");
    expect(talentErrorCode(new Error("invalid_url"))).toBe("invalid_url");
    expect(talentErrorCode(new Error("terms_missing"))).toBe("generic");
  });
  it("Tarefas no menu de todos os papéis da agência", () => {
    expect(AGENCY_NAV).toContain("tasks");
    expect(agencyNavKeys("staff")).toContain("tasks");
    expect(agencyNavKeys("admin").indexOf("tasks")).toBe(agencyNavKeys("admin").indexOf("pipeline") + 1);
  });
});
