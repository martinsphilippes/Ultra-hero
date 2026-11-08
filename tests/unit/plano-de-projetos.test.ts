import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agencyNavKeys } from "@/lib/agency/roles";
import { PLAN_FIELDS, STAGE_KEYS, countByPriority, formatScore, nextStepStatus, parsePlan, progressPercent } from "@/lib/group-projects/format";

// Plano de projetos da Groscove (0137): 25 projetos na ordem oficial, 5W2H e 5 etapas × 6 microetapas.

const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0137_plano_de_projetos.sql"), "utf8");

describe("formato", () => {
  it("a microetapa avança em ciclo", () => {
    expect(nextStepStatus("todo")).toBe("doing");
    expect(nextStepStatus("doing")).toBe("done");
    expect(nextStepStatus("done")).toBe("todo");
  });
  it("percentual como no PDF (0 / 30 · 0%)", () => {
    expect(progressPercent(0, 30)).toBe(0);
    expect(progressPercent(15, 30)).toBe(50);
    expect(progressPercent(30, 30)).toBe(100);
    expect(progressPercent(5, 0)).toBe(0);
  });
  it("nota com vírgula em português", () => {
    expect(formatScore(4.17, "pt-BR")).toBe("4,17");
    expect(formatScore(5, "en")).toBe("5.00");
  });
  it("conta por prioridade e lê só os campos do 5W2H", () => {
    expect(countByPriority([{ priority: "urgent" }, { priority: "urgent" }, { priority: "structural" }] as const)).toEqual({ urgent: 2, important: 0, structural: 1, circumstantial: 0 });
    expect(parsePlan({ what: "A", budget: "x", how_much: "B", why: 3 })).toEqual({ what: "A", how_much: "B" });
    expect(PLAN_FIELDS).toHaveLength(7);
    expect(STAGE_KEYS).toHaveLength(5);
  });
});

describe("menu", () => {
  it("só a Groscove vê o plano de projetos, logo depois da Onda Digital", () => {
    expect(agencyNavKeys("staff")).not.toContain("groupProjects");
    const g = agencyNavKeys("staff", false, { groscove: true });
    expect(g.indexOf("groupProjects")).toBe(g.indexOf("ondaDigital") + 1);
  });
});

describe("migração 0137", () => {
  it("carrega os 25 projetos da ordem oficial, com o 4WAY no modelo padrão", () => {
    const seeds = sql.match(/select pg_temp\.gp_seed\((\d+),/g) ?? [];
    expect(seeds).toHaveLength(25);
    expect(sql).toContain("pg_temp.gp_seed(1, '4WAY - Escola de Inglês'");
    expect(sql).toContain("pg_temp.gp_seed(20, 'Rakuten', 'E-commerce / Comercial', 5.00, 'urgent'");
    expect(sql).toContain("on conflict (agency_id, number) do nothing");
  });
  it("tabelas fechadas e funções fora do anon", () => {
    expect(sql).toMatch(/revoke all on public\.%I from public, anon, authenticated/);
    for (const fn of ["group_projects_list()", "group_project_get(int)", "group_project_save(uuid, jsonb)", "group_project_step_set(uuid, int, int, text, text)", "group_project_members()"]) {
      expect(sql).toContain(`revoke execute on function public.${fn} from public, anon;`);
    }
    expect(sql).not.toMatch(/grant execute[^;]*to[^;]*\banon\b/i);
  });
  it("sem responsável definido ninguém além do gestor marca (coalesce na comparação)", () => {
    expect(sql).toContain("coalesce(auth.uid() = v.owner_id, false)");
  });
});
