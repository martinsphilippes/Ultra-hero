import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bucketShares, bucketTotal, parseProjection, parseYearParam, projectionYears, segmentHint, yearHref } from "@/lib/projection/campaign";

// Projeção de campanhas (0139, pedido de 08/11/2026): "no seu segmento" e "para você", ano com filtro, tudo de campanha.

const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0139_projecao_campanhas.sql"), "utf8");

describe("filtro de período", () => {
  it("padrão é o ano atual; 'total' tira a data; ano estranho volta ao atual", () => {
    expect(parseYearParam(undefined, 2026)).toBe(2026);
    expect(parseYearParam("2027", 2026)).toBe(2027);
    expect(parseYearParam("total", 2026)).toBeNull();
    expect(parseYearParam("abc", 2026)).toBe(2026);
    expect(parseYearParam("1999", 2026)).toBe(2026);
  });
  it("anos do filtro: o atual, o próximo e os anos com valor por perto, em ordem", () => {
    expect(projectionYears([], 2026)).toEqual([2026, 2027]);
    expect(projectionYears([2025, 2026, 2031], 2026)).toEqual([2025, 2026, 2027]);
  });
  it("o filtro mantém a aba", () => {
    expect(yearHref("/agencia/financeiro?f=projection", 2026)).toBe("/agencia/financeiro?f=projection&ano=2026");
    expect(yearHref("/heroi/financeiro", null)).toBe("/heroi/financeiro?ano=total");
  });
});

describe("segmentos no cartão", () => {
  it("até 3 nomes; o resto vira +N", () => {
    expect(segmentHint([])).toBe("");
    expect(segmentHint(["Música", "Moda"])).toBe("Música · Moda");
    expect(segmentHint(["Música", "Moda", "Fitness"])).toBe("Música · Moda · Fitness");
    expect(segmentHint(["Música", "Moda", "Fitness", "Games", "Beleza"])).toBe("Música · Moda · Fitness +2");
  });
});

describe("números", () => {
  it("total = fechado + em negociação + oportunidades abertas; a barra divide em partes", () => {
    const b = { won: 5000, open: 3000, available: 2000 };
    expect(bucketTotal(b)).toBe(10000);
    expect(bucketShares(b)).toEqual({ won: 50, open: 30, available: 20 });
    expect(bucketShares({ won: 0, open: 0, available: 0 })).toEqual({ won: 0, open: 0, available: 0 });
  });
  it("leitura do banco: valor estranho vira zero e o total da agência só vem para o Adm", () => {
    const p = parseProjection({
      year: 2026,
      mine: { won: 100, open: "x", available: -5 },
      segment: { won: 300 },
      platform: {},
      agency: null,
      segments: [{ name: "Música", won: 300, open: 0, available: 0, mine: true }, { won: 1 }],
      my_segments: ["Música", 3],
      years: [2026, "2027"],
    });
    expect(p?.mine).toEqual({ won: 100, open: 0, available: 0 });
    expect(p?.agency).toBeNull();
    expect(p?.segments).toEqual([{ name: "Música", won: 300, open: 0, available: 0, mine: true }]);
    expect(p?.mySegments).toEqual(["Música"]);
    expect(p?.years).toEqual([2026]);
    expect(parseProjection(null)).toBeNull();
  });
});

describe("migração 0139", () => {
  it("entra tudo de campanha: negócios, patrocínio (acordo, negociação e cotas livres) e chamadas das marcas", () => {
    expect(sql).toContain("d.compensation_type <> 'barter' and d.outcome = 'won'");
    expect(sql).toContain("where p.status = 'agreed'");
    expect(sql).toContain("greatest(tr.slots - (select count(*) from public.sponsorship_proposals x where x.tier_id = tr.id and x.status = 'agreed'), 0)");
    expect(sql).toContain("case when c.value_model = 'por_heroi' then c.budget_cents::bigint * coalesce(c.max_heroes, 1) else c.budget_cents::bigint end");
  });
  it("gestor: Heros que ele cuida; sem nenhum, os segmentos da agência; marca fora; total da agência só do Adm", () => {
    expect(sql).toContain("t.manager_id = auth.uid()");
    expect(sql).toContain("if v_member and cardinality(v_seg) = 0 then");
    expect(sql).toContain("if cardinality(v_talents) = 0 then raise exception 'forbidden'");
    expect(sql).toContain("'agency', case when v_admin then");
    expect(sql).toContain("revoke execute on function public.campaign_projection(uuid, int) from public, anon;");
  });
});
