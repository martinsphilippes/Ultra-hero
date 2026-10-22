import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveContentAction } from "@/app/admin/content-actions";
import { LICENSE_KIND_VALUES, allowedLicenseKinds, coerceLicenseKind, parseContentForm, toFormValues } from "@/components/editors/content/schema";
import type { ContentFormValues } from "@/components/editors/types";
import { formatPlainDate } from "@/i18n/format";
import { effectiveRightsStatus, showsFictionalBadge } from "@/lib/catalog/rights";

// Direitos por personalidade (RF-003/RB-05) e licença de mídia (RF-008/RB-06): regras puras
// compartilhadas entre página pública, formulário e server action do admin.

const ids = vi.hoisted(() => ({
  USER: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  CREATOR: "a3bb189e-8bf9-4888-9912-ace4e6543002",
  CONTENT: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
}));
const server = vi.hoisted(() => ({ writes: [] as { table: string; op: string; payload: Record<string, unknown> }[] }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => Object.assign((key: string) => `${namespace}.${key}`, { has: () => true }),
}));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => ({ id: ids.USER }), hasRole: async () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => ({
      // tipo atual do conteúdo (o admin não edita receita pelo formulário antigo desde a 0027)
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { type: "video" }, error: null }) }) }),
      update: (payload: Record<string, unknown>) => {
        server.writes.push({ table, op: "update", payload });
        return { eq: async () => ({ error: null }) };
      },
      upsert: async (payload: Record<string, unknown>) => {
        server.writes.push({ table, op: "upsert", payload });
        return { error: null };
      },
    }),
  }),
}));

const YOUTUBE_ID = "dQw4w9WgXcQ";
const TODAY = new Date("2026-10-20T12:00:00.000Z");

function videoForm(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.CONTENT,
    title: "Mobilidade matinal",
    summary: "Sequência de 10 minutos.",
    pillar: "routine",
    type: "video",
    source_locale: "pt-BR",
    cover_url: "/placeholders/content-1.svg",
    duration_minutes: 10,
    difficulty: "beginner",
    tags: ["mobilidade"],
    has_captions: true,
    disclaimer_kind: "training",
    body: { kind: "video", intro: "Solte o corpo.", key_points: [], transcript: [] },
    media: { provider: "embed_youtube", ref: YOUTUBE_ID, captions_url: null },
    ...overrides,
  };
}
const NO_MEDIA = { provider: "none", ref: null, captions_url: null };
const errorsOf = (input: unknown) => {
  const r = parseContentForm(input);
  return r.ok ? {} : r.errors;
};
const dataOf = (input: unknown) => {
  const r = parseContentForm(input);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.data;
};

describe("effectiveRightsStatus (o que a página pública pode afirmar)", () => {
  it("padrão da POC: fictício; desconhecido ou nulo também", () => {
    expect(effectiveRightsStatus("fictional", null, TODAY)).toBe("fictional");
    expect(effectiveRightsStatus(null, null, TODAY)).toBe("fictional");
    expect(effectiveRightsStatus("real", null, TODAY)).toBe("fictional");
  });

  it("em validação nunca vira autorizado", () => {
    expect(effectiveRightsStatus("pending", "2099-01-01", TODAY)).toBe("pending");
  });

  it("autorizado sem validade ou com validade futura (inclusive hoje) é autorizado", () => {
    expect(effectiveRightsStatus("authorized", null, TODAY)).toBe("authorized");
    expect(effectiveRightsStatus("authorized", "2026-10-21", TODAY)).toBe("authorized");
    expect(effectiveRightsStatus("authorized", "2026-10-20", TODAY)).toBe("authorized");
  });

  it("autorização vencida ou com data ilegível volta a 'em validação'", () => {
    expect(effectiveRightsStatus("authorized", "2026-10-19", TODAY)).toBe("pending");
    expect(effectiveRightsStatus("authorized", "20/10/2027", TODAY)).toBe("pending");
  });

  it("o selo de fictício só sai quando autorizado", () => {
    expect(showsFictionalBadge("fictional")).toBe(true);
    expect(showsFictionalBadge("pending")).toBe(true);
    expect(showsFictionalBadge("authorized")).toBe(false);
  });
});

describe("formatPlainDate (datas sem hora, sem deslocamento de fuso)", () => {
  it("formata por idioma sem voltar um dia", () => {
    expect(formatPlainDate("2026-10-20", "pt-BR")).toBe("20/10/2026");
    expect(formatPlainDate("2026-10-20", "en")).toBe("10/20/2026");
    expect(formatPlainDate("2026-01-01", "es")).toBe("01/01/2026");
  });

  it("devolve a entrada quando não é uma data AAAA-MM-DD", () => {
    expect(formatPlainDate("ontem", "pt-BR")).toBe("ontem");
  });
});

describe("licença de mídia × provedor (espelho de public.media_license_compatible)", () => {
  it("embeds só aceitam third_party_embed; sem mídia aceita platform_demo ou own; hospedada aceita tudo menos embed", () => {
    expect(allowedLicenseKinds("embed_youtube")).toEqual(["third_party_embed"]);
    expect(allowedLicenseKinds("embed_vimeo")).toEqual(["third_party_embed"]);
    expect(allowedLicenseKinds("none")).toEqual(["platform_demo", "own"]);
    expect(allowedLicenseKinds("cloudflare_stream")).toEqual(["platform_demo", "own", "licensed"]);
    expect(LICENSE_KIND_VALUES).toEqual(["platform_demo", "own", "licensed", "third_party_embed"]);
  });

  it("coerceLicenseKind mantém a escolha coerente e corrige a incoerente", () => {
    expect(coerceLicenseKind("none", "own")).toBe("own");
    expect(coerceLicenseKind("none", "third_party_embed")).toBe("platform_demo");
    expect(coerceLicenseKind("embed_youtube", "platform_demo")).toBe("third_party_embed");
    expect(coerceLicenseKind("embed_vimeo", undefined)).toBe("third_party_embed");
  });

  it("formulário: YouTube com platform_demo é recusado; com third_party_embed passa", () => {
    expect(errorsOf(videoForm({ media_license_kind: "platform_demo" }))).toEqual({ media_license_kind: "licenseMismatch" });
    expect(errorsOf(videoForm({ media_license_kind: "third_party_embed", media_credit: "Canal X" }))).toEqual({});
    expect(errorsOf(videoForm({ media: NO_MEDIA, media_license_kind: "third_party_embed" }))).toEqual({ media_license_kind: "licenseMismatch" });
    expect(errorsOf(videoForm({ media_license_kind: "pirata" }))).toHaveProperty("media_license_kind");
  });

  it("licença ausente é derivada do provedor (conteúdo antigo continua salvável)", () => {
    expect(dataOf(videoForm()).media_license_kind).toBe("third_party_embed");
    expect(dataOf(videoForm({ media: NO_MEDIA })).media_license_kind).toBe("platform_demo");
    expect(dataOf(videoForm({ type: "guide", body: { kind: "guide", intro: "", sections: [{ heading: "", text: "x" }], key_points: [] }, media: NO_MEDIA }))).toMatchObject({
      media_license_kind: "platform_demo",
      media_license_ref: "",
      media_credit: "",
    });
    expect(toFormValues({ media: { provider: "embed_youtube", ref: YOUTUBE_ID, captions_url: null } }).media_license_kind).toBe("third_party_embed");
  });

  it("crédito e referência são aparados e limitados", () => {
    expect(dataOf(videoForm({ media_license_kind: "third_party_embed", media_credit: "  Canal X  ", media_license_ref: " LIC-1 " })))
      .toMatchObject({ media_credit: "Canal X", media_license_ref: "LIC-1" });
    expect(errorsOf(videoForm({ media_license_kind: "third_party_embed", media_credit: "x".repeat(161) }))).toEqual({ media_credit: "tooLong" });
    expect(errorsOf(videoForm({ media_license_kind: "third_party_embed", media_license_ref: "x".repeat(301) }))).toEqual({ media_license_ref: "tooLong" });
  });
});

describe("saveContentAction (admin) persiste licença e crédito", () => {
  beforeEach(() => {
    server.writes.length = 0;
  });

  it("grava media_license_kind, crédito e referência (vazios viram null)", async () => {
    const values = videoForm({ media_license_kind: "third_party_embed", media_credit: "Canal X", media_license_ref: "" }) as unknown as ContentFormValues;
    const result = await saveContentAction({ id: ids.CONTENT, creatorId: ids.CREATOR }, values);
    expect(result.ok).toBe(true);
    const update = server.writes.find((w) => w.table === "content" && w.op === "update")?.payload;
    expect(update).toMatchObject({ media_license_kind: "third_party_embed", media_credit: "Canal X", media_license_ref: null });
  });

  it("licença incoerente é recusada antes do banco", async () => {
    const values = videoForm({ media_license_kind: "own" }) as unknown as ContentFormValues;
    expect(await saveContentAction({ id: ids.CONTENT, creatorId: ids.CREATOR }, values)).toEqual({ ok: false, error: "adminContent.errors.invalid_input" });
    expect(server.writes).toEqual([]);
  });
});
