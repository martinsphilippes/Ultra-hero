import { describe, expect, it } from "vitest";
import { agencyNavKeys } from "@/lib/agency/roles";
import { PARTNER_TERMS_VERSION } from "@/lib/partner-terms/version";
import { MEMBER_LEVELS, isMemberLevel, levelRank, memberProfileComplete } from "@/lib/team/levels";
import { HERO_SEGMENTS, HERO_SEGMENTS_MAX, isHeroSegment, normalizeSegments } from "@/lib/team/segments";

// Reunião Groscove (06/11/2026), lote B (0125): níveis, cadastro PJ do colaborador e segmentos do Hero.
describe("níveis Júnior < Pleno < Sênior", () => {
  it("só os três níveis valem e a ordem é júnior < pleno < sênior", () => {
    expect(MEMBER_LEVELS).toEqual(["junior", "pleno", "senior"]);
    expect(isMemberLevel("premium")).toBe(false);
    expect(levelRank("junior")).toBeLessThan(levelRank("pleno"));
    expect(levelRank("pleno")).toBeLessThan(levelRank("senior"));
    expect(levelRank(null)).toBe(0);
  });
  it("cadastro do colaborador completo só com CNPJ válido, nível e o termo vigente", () => {
    const ok = { cnpj: "11222333000181", level: "pleno", termsVersion: PARTNER_TERMS_VERSION };
    expect(memberProfileComplete(ok)).toBe(true);
    expect(memberProfileComplete({ ...ok, cnpj: "11111111111111" })).toBe(false);
    expect(memberProfileComplete({ ...ok, level: null })).toBe(false);
    expect(memberProfileComplete({ ...ok, termsVersion: "2026-10-31" })).toBe(false);
    expect(memberProfileComplete(null)).toBe(true);
  });
  it("todo membro vê Meu cadastro; o admin da plataforma sem vínculo não", () => {
    expect(agencyNavKeys("staff")).toContain("profile");
    expect(agencyNavKeys(null, true)).not.toContain("profile");
  });
});

describe("segmentos do Hero", () => {
  it("são os 10 territórios do Calendário Groscove, sem feriados", () => {
    expect(HERO_SEGMENTS).toHaveLength(10);
    expect(isHeroSegment("feriados")).toBe(false);
    expect(isHeroSegment("geek_tech")).toBe(true);
  });
  it("normaliza: tira inválidos e repetidos, ordem do calendário, no máximo 4", () => {
    expect(normalizeSegments(["moda", "futebol", "moda", "feriados", "x"])).toEqual(["futebol", "moda"]);
    expect(normalizeSegments(["sustentabilidade", "moda", "saude", "social", "musica"])).toHaveLength(HERO_SEGMENTS_MAX);
  });
});
