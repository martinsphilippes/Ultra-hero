import { describe, expect, it } from "vitest";
import { LINKED_PRODUCTS_MAX, contentBlocksSchema, parseContentForm } from "@/components/editors/content/schema";
import type { ContentFormValues } from "@/components/editors/types";

// "Novo conteúdo" por blocos (0075/0076): o formulário do admin manda, junto do conteúdo, o bloco do
// pilar, o programa e os produtos vinculados. Sem a chave `blocks` o formulário segue como antes.

const G1 = "0f8fad5b-d9cb-469f-a165-70867728950e";
const P1 = "5d1f5c2e-3b8a-4c7d-9e0f-1a2b3c4d5e6f";

const base = (): ContentFormValues => ({
  title: "Semana 1 do programa",
  summary: "",
  pillar: "training",
  type: "article",
  source_locale: "pt-BR",
  cover_url: "",
  duration_minutes: null,
  difficulty: null,
  tags: [],
  has_captions: false,
  disclaimer_kind: null,
  body: { kind: "article", intro: "", sections: [], key_points: [] },
  media: { provider: "none", ref: null, captions_url: null },
  media_license_kind: "own",
  media_license_ref: "",
  media_credit: "",
});

describe("blocos no formulário de conteúdo", () => {
  it("sem blocks o formulário valida como antes e nada é acrescentado", () => {
    const parsed = parseContentForm(base());
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.data.blocks).toBeUndefined();
  });

  it("treino + programa + produtos passam juntos e chegam à action", () => {
    const values = base();
    values.blocks = {
      pillar: { kind: "workout", data: { description: "Semana 1", steps: [{ text: "Correr 10 min" }] } },
      program: { kind: "program", data: { program_id: G1, note: "Siga o programa" } },
      products: [P1],
    };
    const parsed = parseContentForm(values);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.data.blocks).toEqual(values.blocks);
  });

  it("Rotina sem bloco e sem programa: nulos explícitos (a action apaga o que havia)", () => {
    const values = base();
    values.pillar = "routine";
    values.blocks = { pillar: null, program: null, products: [] };
    const parsed = parseContentForm(values);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.data.blocks).toEqual({ pillar: null, program: null, products: [] });
  });

  it("programa não entra no slot do pilar; produto precisa ser id; limite de produtos", () => {
    expect(contentBlocksSchema.safeParse({ pillar: { kind: "program", data: { program_id: G1, note: "" } }, program: null, products: [] }).success).toBe(false);
    expect(contentBlocksSchema.safeParse({ pillar: null, program: null, products: ["nao-uuid"] }).success).toBe(false);
    expect(contentBlocksSchema.safeParse({ pillar: null, program: null, products: Array.from({ length: LINKED_PRODUCTS_MAX + 1 }, () => P1) }).success).toBe(false);
    const values = base();
    values.blocks = { pillar: null, program: { kind: "program", data: { program_id: "x", note: "" } }, products: [] };
    const parsed = parseContentForm(values);
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && Object.keys(parsed.errors)[0]).toMatch(/^blocks\.program/);
  });
});
