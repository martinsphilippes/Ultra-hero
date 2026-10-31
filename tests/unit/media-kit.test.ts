import { describe, expect, it } from "vitest";
import { audienceBars, buildKit, FORBIDDEN_KIT_KEYS, formatBp, formatCount, isStale, orphanMetricFields, pickAudience, type KitSource, type SocialRow } from "@/lib/talent/media-kit";

const ig: SocialRow = {
  network: "instagram",
  handle: "talento.um",
  url: "https://instagram.com/talento.um",
  followers: 48200,
  avg_views: 23100,
  avg_reach: null,
  engagement_bp: 412,
  audience: { gender: { female: 6100, male: 3900 }, age: { "18-24": 3000, "25-34": 5000 } },
  source: "declared",
  as_of: "2026-10-20",
  declared_side: "talent",
  updated_at: "2026-10-21T10:00:00Z",
};
const tt: SocialRow = { ...ig, network: "tiktok", handle: "t1", followers: 91500, audience: {}, declared_side: "agency" };

const source = (fields: string[]): KitSource => ({
  name: "Talento Um",
  photoUrl: "https://example.com/a.jpg",
  city: "São Paulo",
  state: "SP",
  segments: ["Fitness"],
  networks: [ig, tt],
  headline: "Treino curto",
  about: "Rotina possível",
  visibleFields: fields,
  brands: [{ name: "Marca", logo_url: null }],
  agencyName: "Agência A",
  agencyEmail: "contato@agencia.test",
});

describe("media kit: mesmo filtro de media_kit_resolve", () => {
  it("nome sempre; campo não marcado = chave ausente", () => {
    const kit = buildKit(source(["headline"]));
    expect(kit.name).toBe("Talento Um");
    expect(kit.headline).toBe("Treino curto");
    for (const key of ["about", "city", "state", "segments", "networks", "photo_url", "brands", "agency", "agency_email"]) expect(kit).not.toHaveProperty(key);
  });

  it("métricas das redes só com o campo marcado; ordem pela maior base de seguidores", () => {
    const kit = buildKit(source(["networks", "followers"]));
    expect(kit.networks?.map((n) => n.network)).toEqual(["tiktok", "instagram"]);
    expect(kit.networks?.[1]).toMatchObject({ followers: 48200, as_of: "2026-10-20", declared_side: "talent", declared_at: "2026-10-21" });
    expect(kit.networks?.[1]).not.toHaveProperty("avg_views");
    expect(kit.networks?.[1]).not.toHaveProperty("engagement_bp");
    expect(kit.networks?.[1]).not.toHaveProperty("audience");
  });

  it("métrica nula fica ausente (a tela escreve \"não informado\", nunca zero)", () => {
    const kit = buildKit(source(["networks", "reach"]));
    expect(kit.networks?.[0]).not.toHaveProperty("avg_reach");
    expect(formatCount(null, "pt-BR")).toBeNull();
  });

  it("audiência vazia não sai; gráficos usam a rede com mais seguidores que declarou audiência", () => {
    const kit = buildKit(source(["networks", "audience", "followers"]));
    expect(kit.networks?.find((n) => n.network === "tiktok")).not.toHaveProperty("audience");
    const chosen = pickAudience(kit.networks ?? []);
    expect(chosen?.network).toBe("instagram");
    expect(audienceBars(chosen?.audience)).toEqual({
      gender: [
        { key: "female", bp: 6100 },
        { key: "male", bp: 3900 },
      ],
      age: [
        { key: "18-24", bp: 3000 },
        { key: "25-34", bp: 5000 },
      ],
    });
    expect(audienceBars(null)).toEqual({ gender: null, age: null });
    expect(pickAudience([])).toBeNull();
  });

  it("contato da agência e marcas só quando marcados; campo desconhecido é ignorado", () => {
    const kit = buildKit(source(["agency_contact", "brands", "cache"]));
    expect(kit.fields).toEqual(["agency_contact", "brands"]);
    expect(kit).toMatchObject({ agency: "Agência A", agency_email: "contato@agencia.test", brands: [{ name: "Marca", logo_url: null }] });
  });

  it("nenhuma chave de valor nem campo interno em nenhum kit", () => {
    const all = buildKit(source(["photo", "headline", "about", "location", "segments", "networks", "followers", "views", "reach", "engagement", "audience", "brands", "agency_contact"]));
    const keys = JSON.stringify(all).match(/"([a-z_]+)":/g) ?? [];
    expect(keys.filter((k) => FORBIDDEN_KIT_KEYS.test(k))).toEqual([]);
  });

  it("formatos: pontos-base em %, número compacto e dado com mais de um ano", () => {
    expect(formatBp(235, "pt-BR")).toBe("2,35%");
    expect(formatBp(412, "en")).toBe("4.12%");
    expect(formatCount(950, "pt-BR")).toBe("950");
    expect(isStale("2025-01-01", new Date("2026-10-31T12:00:00Z"))).toBe(true);
    expect(isStale("2026-10-01", new Date("2026-10-31T12:00:00Z"))).toBe(false);
  });

  it("métrica marcada sem \"Redes\" avisa que não aparece", () => {
    expect(orphanMetricFields(["followers", "headline"])).toEqual(["followers"]);
    expect(orphanMetricFields(["networks", "followers"])).toEqual([]);
  });
});
