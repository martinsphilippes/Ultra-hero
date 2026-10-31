import { describe, expect, it } from "vitest";
import { asOfInRange, audienceSchema, handleSchema, kitSchema, parseCount, percentToBp, shareKitSchema, socialSchema, talentSchema } from "@/lib/talent/schemas";
import { AGE_BANDS, KIT_FIELDS, NETWORKS, UFS } from "@/lib/talent/vocab";

const today = new Date("2026-10-31T12:00:00Z");
const uuid = "75000000-0000-4000-8000-0000000000d1";

describe("listas fechadas iguais aos checks da 0065", () => {
  it("redes, faixas, campos do kit e UFs", () => {
    expect(NETWORKS).toEqual(["instagram", "tiktok", "youtube", "x", "facebook", "kwai", "twitch", "linkedin", "pinterest", "threads", "other"]);
    expect(AGE_BANDS).toEqual(["13-17", "18-24", "25-34", "35-44", "45-54", "55+"]);
    expect(KIT_FIELDS).toHaveLength(13);
    expect(UFS).toHaveLength(27);
  });
});

describe("audienceSchema", () => {
  it("aceita grupos que somam até 10000 e até 5 UFs/países", () => {
    expect(audienceSchema.safeParse({ gender: { female: 6000, male: 4000 }, age: { "18-24": 10000 }, top_states: ["SP", "RJ"], top_countries: ["BR", "PT"] }).success).toBe(true);
    expect(audienceSchema.safeParse({}).success).toBe(true);
  });
  it("recusa soma acima de 100%, chave desconhecida, UF inválida, mais de 5 e repetidos", () => {
    expect(audienceSchema.safeParse({ gender: { female: 8000, male: 3000 } }).success).toBe(false);
    expect(audienceSchema.safeParse({ age: { "18-24": 6000, "25-34": 5000 } }).success).toBe(false);
    expect(audienceSchema.safeParse({ renda: { a: 1 } }).success).toBe(false);
    expect(audienceSchema.safeParse({ gender: { nb: 100 } }).success).toBe(false);
    expect(audienceSchema.safeParse({ top_states: ["XX"] }).success).toBe(false);
    expect(audienceSchema.safeParse({ top_states: ["SP", "RJ", "MG", "BA", "PR", "SC"] }).success).toBe(false);
    expect(audienceSchema.safeParse({ top_countries: ["BR", "BR"] }).success).toBe(false);
    expect(audienceSchema.safeParse({ gender: { female: 12.5 } }).success).toBe(false);
  });
});

describe("redes declaradas", () => {
  it("perfil sem @ e sem espaço", () => {
    expect(handleSchema.parse("@talento.um")).toBe("talento.um");
    expect(handleSchema.safeParse("com espaço").success).toBe(false);
    expect(handleSchema.safeParse("@").success).toBe(false);
  });
  it("as_of entre hoje − 2 anos e hoje", () => {
    expect(asOfInRange("2026-10-31", today)).toBe(true);
    expect(asOfInRange("2024-11-01", today)).toBe(true);
    expect(asOfInRange("2026-11-01", today)).toBe(false);
    expect(asOfInRange("2024-10-30", today)).toBe(false);
    expect(asOfInRange("2026-02-30", today)).toBe(false);
  });
  it("source nunca entra no formulário (o banco grava sempre declared)", () => {
    const base = { talentId: uuid, id: null, network: "instagram", handle: "x", url: "", followers: 10, avgViews: null, avgReach: null, engagementBp: 235, asOf: new Date().toISOString().slice(0, 10), audience: {} };
    const parsed = socialSchema.parse({ ...base, source: "integration" });
    expect(parsed).not.toHaveProperty("source");
    expect(socialSchema.safeParse({ ...base, url: "http://inseguro.com" }).success).toBe(false);
    expect(socialSchema.safeParse({ ...base, engagementBp: 10001 }).success).toBe(false);
  });
  it("percentual e contagem digitados", () => {
    expect(percentToBp("2,35")).toBe(235);
    expect(percentToBp("100")).toBe(10000);
    expect(percentToBp("")).toBeNull();
    expect(percentToBp("101")).toBeUndefined();
    expect(percentToBp("abc")).toBeUndefined();
    expect(parseCount("48.200")).toBe(48200);
    expect(parseCount("")).toBeNull();
    expect(parseCount("-3")).toBeUndefined();
  });
});

describe("kit, link e ficha", () => {
  it("campos visíveis só da lista; validade de 1 a 90 dias", () => {
    expect(kitSchema.safeParse({ talentId: uuid, headline: "a", about: "b", visibleFields: ["headline", "networks"] }).success).toBe(true);
    expect(kitSchema.safeParse({ talentId: uuid, headline: "a", about: "b", visibleFields: ["cache"] }).success).toBe(false);
    expect(kitSchema.safeParse({ talentId: uuid, headline: "x".repeat(141), about: "", visibleFields: [] }).success).toBe(false);
    expect(shareKitSchema.safeParse({ talentId: uuid, days: 30 }).success).toBe(true);
    expect(shareKitSchema.safeParse({ talentId: uuid, days: 91 }).success).toBe(false);
  });
  it("ficha do talento: UF da lista, e-mail e telefone opcionais", () => {
    const base = { displayName: "Talento", city: "", state: "", managerId: "", commercialStatus: "prospect", availability: "available", availabilityNote: "", contactEmail: "", contactPhone: "", internalNotes: "", lastContactAt: "" };
    expect(talentSchema.safeParse(base).success).toBe(true);
    expect(talentSchema.safeParse({ ...base, state: "XX" }).success).toBe(false);
    expect(talentSchema.safeParse({ ...base, contactEmail: "nao-e-email" }).success).toBe(false);
    expect(talentSchema.safeParse({ ...base, contactPhone: "+55 11 99999-0000" }).success).toBe(true);
    expect(talentSchema.safeParse({ ...base, displayName: "A" }).success).toBe(false);
  });
});
