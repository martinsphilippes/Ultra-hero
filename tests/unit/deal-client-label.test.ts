import { describe, expect, it } from "vitest";
import { campaignHeroIds, dealClientLabel, heroNames } from "@/lib/deals/client-label";

// Hero cliente (contrata a agência) × Heros da campanha (escalados): rótulo do card e lista enviada ao escalar.

const t = (_key: "clientHero", values: { name: string }) => `${values.name} (cliente)`;

describe("rótulo do cliente do negócio", () => {
  it("marca e Hero cliente: o Hero leva o rótulo de cliente, distinto da marca", () => {
    expect(dealClientLabel(t, "Marca", "Philippe Martins")).toBe("Marca · Philippe Martins (cliente)");
  });
  it("só a marca: sem rótulo extra", () => {
    expect(dealClientLabel(t, "Marca", null)).toBe("Marca");
    expect(dealClientLabel(t, "Marca", "  ")).toBe("Marca");
  });
  it("só o Hero cliente (negócio sem marca)", () => {
    expect(dealClientLabel(t, "", "Philippe Martins")).toBe("Philippe Martins (cliente)");
    expect(dealClientLabel(t, undefined, " Ana ")).toBe("Ana (cliente)");
  });
  it("sem cliente nenhum: vazio", () => {
    expect(dealClientLabel(t, null, null)).toBe("");
  });
});

describe("Heros da campanha", () => {
  it("tira vazios e repetidos e respeita a ordem", () => {
    expect(campaignHeroIds(["a", "", "b", "a", " c "])).toEqual(["a", "b", "c"]);
  });
  it("corta no máximo aceito pelo banco", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `id${i}`);
    expect(campaignHeroIds(ids)).toHaveLength(30);
    expect(campaignHeroIds(ids, 2)).toEqual(["id0", "id1"]);
  });
  it("nomes dos que falharam, ignorando ids desconhecidos", () => {
    const talents = [
      { id: "a", name: "Ana" },
      { id: "b", name: " Bia " },
    ];
    expect(heroNames(["b", "x", "a"], talents)).toEqual(["Bia", "Ana"]);
  });
});
