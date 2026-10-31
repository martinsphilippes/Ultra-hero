import { describe, expect, it } from "vitest";
import { agencyErrorCode } from "@/lib/agency/error-codes";
import { AGENCY_ROUTE_MIN, agencyNavKeys, brandNavKeys, canWorkDeal } from "@/lib/agency/roles";
import { brandRequestSchema, formatCents, parseBrlToCents, requestDeliverablesSchema, toZonedIso } from "@/lib/deals/schemas";
import { brandStatus, canConfirm, canMove, DEAL_STAGES, isPreConfirmation, moveNeedsNote, nextStages, stageIndex } from "@/lib/deals/stages";
import { isDocumentsRevalidatePath } from "@/lib/documents/constants";
import { isBlockedInNativeApp } from "@/lib/native-app/surface";
import { talentErrorCode } from "@/lib/talent/error-codes";

// P1a (0066): espelhos puros das regras do banco (deal_stage_can, deal_brand_status), formas dos
// formulários (entregáveis estritos, valor em centavos, data+hora no fuso) e travas de navegação.

describe("etapas do negócio (espelho de deal_stage_index / deal_brand_status)", () => {
  it("13 etapas na ordem da spec, encerrado por último", () => {
    expect(DEAL_STAGES).toHaveLength(13);
    expect(stageIndex("briefing_received")).toBe(1);
    expect(stageIndex("approved")).toBe(8);
    expect(stageIndex("closed")).toBe(13);
  });

  it("situação vista pela marca (6.3)", () => {
    expect(brandStatus("briefing_received", null)).toBe("received");
    expect(brandStatus("qualification", null)).toBe("received");
    expect(brandStatus("shortlist", null)).toBe("building");
    expect(brandStatus("proposal_prep", null)).toBe("building");
    expect(brandStatus("proposal_sent", null)).toBe("proposal");
    expect(brandStatus("negotiation", null)).toBe("proposal");
    expect(brandStatus("approved", null)).toBe("contracting");
    expect(brandStatus("contracting", null)).toBe("contracting");
    expect(brandStatus("production", null)).toBe("running");
    expect(brandStatus("delivery", null)).toBe("running");
    expect(brandStatus("closed", "won")).toBe("done");
    expect(brandStatus("closed", "lost")).toBe("cancelled");
    expect(brandStatus("closed", null)).toBe("cancelled");
  });
});

describe("movimento manual de etapa (espelho de deal_stage_can)", () => {
  it("porteiras nunca por movimento manual", () => {
    expect(canMove("admin", true, "consultation", "proposal_sent")).toBe(false);
    expect(canMove("admin", true, "negotiation", "approved")).toBe(false);
    expect(canMove("admin", true, "contracting", "production")).toBe(false);
    expect(nextStages("admin", true, "consultation")).not.toContain("approved");
  });

  it("gestor+ move; colaborador só quando é responsável", () => {
    expect(canMove("manager", false, "briefing_received", "qualification")).toBe(true);
    expect(canMove("staff", false, "briefing_received", "qualification")).toBe(false);
    expect(canMove("staff", true, "briefing_received", "qualification")).toBe(true);
    expect(canMove(null, true, "briefing_received", "qualification")).toBe(false);
  });

  it("não volta da produção para antes e não sai de aprovado para antes da confirmação", () => {
    expect(canMove("admin", true, "production", "consultation")).toBe(false);
    expect(canMove("admin", true, "approved", "negotiation")).toBe(false);
    // "aprovado" é porteira: nem para voltar da contratação
    expect(canMove("admin", true, "contracting", "approved")).toBe(false);
    expect(canMove("admin", true, "delivery", "approval")).toBe(true);
  });

  it("encerrado nunca entra na lista; mesma etapa não é movimento", () => {
    expect(canMove("admin", true, "delivery", "closed")).toBe(false);
    expect(canMove("admin", true, "closed", "delivery")).toBe(false);
    expect(canMove("admin", true, "shortlist", "shortlist")).toBe(false);
  });

  it("voltar pede nota; avançar não", () => {
    expect(moveNeedsNote("consultation", "shortlist")).toBe(true);
    expect(moveNeedsNote("shortlist", "consultation")).toBe(false);
  });

  it("confirmação só da consulta até a negociação; antes da confirmação o elenco ainda muda", () => {
    expect(canConfirm("shortlist")).toBe(false);
    expect(canConfirm("consultation")).toBe(true);
    expect(canConfirm("negotiation")).toBe(true);
    expect(canConfirm("approved")).toBe(false);
    expect(isPreConfirmation("negotiation")).toBe(true);
    expect(isPreConfirmation("approved")).toBe(false);
  });
});

describe("formas dos formulários", () => {
  it("entregável da marca é estrito: só kind, quantity e network (sem chave de valor)", () => {
    expect(requestDeliverablesSchema.safeParse([{ kind: "post", quantity: 2 }]).success).toBe(true);
    expect(requestDeliverablesSchema.safeParse([{ kind: "post", quantity: 2, network: "instagram" }]).success).toBe(true);
    expect(requestDeliverablesSchema.safeParse([{ kind: "post", quantity: 2, fee_cents: 100 }]).success).toBe(false);
    expect(requestDeliverablesSchema.safeParse([{ kind: "banner", quantity: 1 }]).success).toBe(false);
    expect(requestDeliverablesSchema.safeParse([{ kind: "post", quantity: 0 }]).success).toBe(false);
  });

  it("valor em reais vira centavos; vazio é null; inválido é undefined", () => {
    expect(parseBrlToCents("1.500,00")).toBe(150_000);
    expect(parseBrlToCents("R$ 12.000")).toBe(1_200_000);
    expect(parseBrlToCents("89,9")).toBe(8_990);
    expect(parseBrlToCents("")).toBe(null);
    expect(parseBrlToCents("abc")).toBeUndefined();
    expect(parseBrlToCents("1,234")).toBeUndefined();
    expect(formatCents(150_000, "pt-BR").replace(/\s/g, " ")).toBe("R$ 1.500,00");
  });

  it("data e hora da marca viram instante no fuso de São Paulo", () => {
    expect(toZonedIso("2026-11-10", "14:30", "America/Sao_Paulo")).toBe("2026-11-10T14:30:00-03:00");
    expect(toZonedIso("2026-11-10", "", "America/Sao_Paulo")).toBeNull();
    expect(toZonedIso("2026-11-10", "14:30", "UTC")).toBe("2026-11-10T14:30:00+00:00");
  });

  it("proposta da marca: rascunho vazio passa; valor negativo e UF inventada não", () => {
    const base = { id: null, talentId: "", title: "", objective: "", product: "", targetAudience: "", targetAgeBands: [], targetStates: [], regionNote: "", periodStart: "", periodEnd: "", desiredTime: "", durationMinutes: "", format: "", location: "", networks: [], deliverables: [], notes: "", budgetMaxCents: null, budgetNote: "" };
    expect(brandRequestSchema.safeParse(base).success).toBe(true);
    expect(brandRequestSchema.safeParse({ ...base, budgetMaxCents: -1 }).success).toBe(false);
    expect(brandRequestSchema.safeParse({ ...base, targetStates: ["XX"] }).success).toBe(false);
    expect(brandRequestSchema.safeParse({ ...base, desiredTime: "9h" }).success).toBe(false);
  });
});

describe("erros, menus e travas", () => {
  it("códigos novos das RPCs viram códigos conhecidos (agência) e os do escritório têm texto próprio", () => {
    for (const code of ["request_incomplete", "note_required", "stage_gate", "invalid_stage", "fee_missing", "no_talents", "schedule_conflict", "deliverables_open"]) {
      expect(agencyErrorCode({ message: code })).toBe(code);
    }
    expect(talentErrorCode({ message: "note_required" })).toBe("note_required");
    expect(talentErrorCode({ message: "fee_missing" })).toBe("generic");
  });

  it("Pipeline para todos os níveis; Novo negócio só gestor+; marca ganha Campanhas e Creators", () => {
    expect(agencyNavKeys("staff")).toContain("pipeline");
    expect(AGENCY_ROUTE_MIN["/agencia/pipeline/novo"]).toBe("manager");
    expect(brandNavKeys()).toEqual(["dashboard", "campaigns", "catalog", "agenda", "team", "notifications"]);
  });

  it("quem mexe no negócio: gestor+ sempre; colaborador só responsável/equipe", () => {
    expect(canWorkDeal("manager", false)).toBe(true);
    expect(canWorkDeal("staff", false)).toBe(false);
    expect(canWorkDeal("staff", true)).toBe(true);
    expect(canWorkDeal(null, true)).toBe(false);
    expect(canWorkDeal(null, false, true)).toBe(true);
  });

  it("documentos revalidam só as telas conhecidas", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(isDocumentsRevalidatePath(`/agencia/negocios/${id}/documentos`)).toBe(true);
    expect(isDocumentsRevalidatePath(`/marca/campanhas/${id}`)).toBe(true);
    expect(isDocumentsRevalidatePath(`/marca/campanhas/${id}/x`)).toBe(false);
    expect(isDocumentsRevalidatePath("/")).toBe(false);
  });

  it("oportunidades e disponibilidade existem no app das lojas; pipeline e campanhas da marca não", () => {
    expect(isBlockedInNativeApp("/creator/escritorio/oportunidades")).toBe(false);
    expect(isBlockedInNativeApp("/creator/escritorio/disponibilidade")).toBe(false);
    expect(isBlockedInNativeApp("/agencia/pipeline")).toBe(true);
    expect(isBlockedInNativeApp("/marca/campanhas/nova")).toBe(true);
  });
});
