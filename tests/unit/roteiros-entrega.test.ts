import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AGENCY_ERROR_CODES, agencyErrorCode } from "@/lib/agency/error-codes";
import { INBOX_KINDS, inboxKindEmails, inboxKindPushes } from "@/lib/inbox/kinds";
import {
  addBusinessDays,
  brHolidays,
  businessDaysBetween,
  easter,
  isBusinessDay,
  nextBusinessDay,
  plannedTotal,
  planRoadmap,
  roadmapDay,
  rollBusinessDay,
  type PlanStep,
} from "@/lib/roadmap/business-days";
import { serviceSaveSchema, toServicePayload } from "@/lib/roadmap/schemas";
import { clientKindOf, isSector, MILESTONES, SECTORS, serviceFitsClient } from "@/lib/roadmap/vocab";

const MIGRATION = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0107_roteiros_entrega.sql"), "utf8");

type ModelStep = { t: string; s: string; s2?: string; d?: number; rec?: string; par?: boolean; v?: boolean; a?: boolean; m?: string };
type ModelService = { slug: string; name: string; client: string; rec: string; sla: number; mdays?: number; mlabel?: string; steps: ModelStep[] };

/** O modelo Groscove como está na migração (groscove_service_model). */
function model(): ModelService[] {
  const m = /\$json\$(\[[\s\S]*?\])\$json\$/.exec(MIGRATION);
  if (!m) throw new Error("modelo não encontrado na 0107");
  return JSON.parse(m[1]) as ModelService[];
}

const toPlan = (steps: ModelStep[]): PlanStep[] =>
  steps.map((x) => ({ dueRule: x.rec ? "recurring" : (x.d ?? 1) === 0 ? "same_day" : "business_days", dueDays: x.d ?? 1, dependsOnPrev: !x.par, automatic: x.a ?? false }));

describe("dias úteis BR (espelho de public.br_*)", () => {
  it("Páscoa e feriados móveis", () => {
    expect(easter(2026)).toBe("2026-04-05");
    expect(easter(2027)).toBe("2027-03-28");
    expect(easter(2025)).toBe("2025-04-20");
    const h27 = brHolidays(2027);
    expect(h27.get("2027-02-08")).toBe("Carnaval");
    expect(h27.get("2027-02-09")).toBe("Carnaval");
    expect(h27.get("2027-03-26")).toBe("Paixão de Cristo");
    expect(h27.get("2027-05-27")).toBe("Corpus Christi");
    expect(brHolidays(2026).size).toBe(13);
  });

  it("os feriados nacionais do Calendário Groscove (0099) estão na lista; aniversários de cidades não", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0099_calendario_groscove_dados.sql"), "utf8");
    const nationals = ["ano-novo", "paixao-de-cristo", "tiradentes", "dia-mundial-do-trabalho", "corpus-christi", "nossa-senhora-de-aparecida", "dia-dos-mortos-finados", "proclamacao-da-republica", "dia-nacional-da-consciencia-negra", "natal"];
    for (const year of [2026, 2027]) {
      for (const slug of nationals) {
        const m = new RegExp(`gc:calendario-groscove-${year}-geral:(\\d{4}-\\d{2}-\\d{2}):${slug}'`).exec(sql);
        expect(m, `${year} ${slug}`).not.toBeNull();
        expect(brHolidays(year).has(m![1]), `${year} ${slug}`).toBe(true);
      }
    }
    expect(isBusinessDay("2026-03-01")).toBe(false); // domingo (aniversário do Rio)
    expect(isBusinessDay("2026-03-12")).toBe(true); // aniversário de Recife: dia útil
    expect(isBusinessDay("2026-10-28")).toBe(true); // Dia do Servidor Público: dia útil
  });

  it("andar, rolar e contar dias úteis", () => {
    expect(isBusinessDay("2026-11-20")).toBe(false);
    expect(isBusinessDay("2026-11-21")).toBe(false);
    expect(isBusinessDay("2026-12-24")).toBe(true);
    expect(nextBusinessDay("2026-12-24")).toBe("2026-12-28");
    expect(addBusinessDays("2027-02-05", 1)).toBe("2027-02-10");
    expect(addBusinessDays("2026-11-04", 0)).toBe("2026-11-04");
    expect(rollBusinessDay("2026-11-21")).toBe("2026-11-23");
    expect(rollBusinessDay("2026-11-23")).toBe("2026-11-23");
    expect(businessDaysBetween("2026-11-13", "2026-11-23")).toBe(5);
    expect(businessDaysBetween("2026-11-23", "2026-11-13")).toBe(0);
  });

  it("Dia X: o início (rolado) é o Dia 1; antes dele, 0", () => {
    expect(roadmapDay("2026-11-21", "2026-11-23")).toBe(1);
    expect(roadmapDay("2026-11-23", "2026-11-24")).toBe(2);
    expect(roadmapDay("2026-11-23", "2026-11-20")).toBe(0);
  });
});

describe("planejamento do roteiro (espelho de public.roadmap_recalc)", () => {
  const start = "2027-03-01"; // segunda
  const today = "2027-03-01";

  it("cadeia: n dias úteis, mesmo dia e em paralelo", () => {
    const plan = planRoadmap(
      [
        { dueRule: "business_days", dueDays: 1, dependsOnPrev: true },
        { dueRule: "business_days", dueDays: 3, dependsOnPrev: true },
        { dueRule: "same_day", dueDays: 0, dependsOnPrev: true },
        { dueRule: "business_days", dueDays: 5, dependsOnPrev: false },
        { dueRule: "business_days", dueDays: 1, dependsOnPrev: true },
      ],
      start,
      today,
    );
    expect(plan.map((p) => `${p.availableOn}>${p.dueOn}`)).toEqual([
      "2027-03-01>2027-03-01",
      "2027-03-02>2027-03-04",
      "2027-03-04>2027-03-04",
      "2027-03-04>2027-03-10",
      "2027-03-11>2027-03-11",
    ]);
  });

  it("concluir antes/depois move as seguintes; vencida aberta empurra a previsão para hoje; automática alcançada conclui", () => {
    const steps: PlanStep[] = [
      { dueRule: "business_days", dueDays: 2, dependsOnPrev: true, completedOn: "2027-03-01" },
      { dueRule: "business_days", dueDays: 1, dependsOnPrev: true },
    ];
    expect(planRoadmap(steps, start, "2027-03-01")[1].dueOn).toBe("2027-03-02");
    const late = planRoadmap([{ dueRule: "business_days", dueDays: 1, dependsOnPrev: true }, { dueRule: "business_days", dueDays: 1, dependsOnPrev: true }], start, "2027-03-10");
    expect(late[0]).toEqual({ availableOn: "2027-03-01", dueOn: "2027-03-01", done: false });
    expect(late[1].dueOn).toBe("2027-03-11");
    const auto = planRoadmap(
      [
        { dueRule: "business_days", dueDays: 1, dependsOnPrev: true, completedOn: "2027-03-01" },
        { dueRule: "same_day", dueDays: 0, dependsOnPrev: true, automatic: true },
        { dueRule: "business_days", dueDays: 1, dependsOnPrev: true, automatic: true },
        { dueRule: "business_days", dueDays: 1, dependsOnPrev: true },
      ],
      start,
      "2027-03-01",
    );
    expect(auto.map((p) => p.done)).toEqual([true, true, true, false]);
    expect(auto[3].dueOn).toBe("2027-03-02");
  });

  it("os 8 produtos do PDF fecham exatamente nos prazos (total e marco intermediário)", () => {
    const services = model();
    expect(services.map((s) => `${s.slug}:${s.sla}`)).toEqual([
      "producao-de-video:40",
      "producao-fotografica:25",
      "assessoria-de-imprensa:20",
      "assessoria-artistica:13",
      "mentoria-jonathas:28",
      "business-plan:60",
      "publipost:15",
      "live-session:35",
    ]);
    for (const s of services) {
      const steps = toPlan(s.steps);
      // serviços recorrentes: o prazo é o das 1ªs entregas (o marco); os ciclos seguem depois (Fase 3)
      if (s.rec === "none") expect(plannedTotal(steps), s.slug).toBe(s.sla);
      if (s.mdays) {
        const plan = planRoadmap(steps, start, "1900-01-01");
        const idx = s.steps.findIndex((x) => x.m === "first_result" || x.m === "go_live" || x.m === "presentation");
        expect(idx, s.slug).toBeGreaterThan(-1);
        expect(roadmapDay(start, plan[idx].dueOn), s.slug).toBe(s.mdays);
      }
      for (const x of s.steps) {
        expect(isSector(x.s), `${s.slug} ${x.t}`).toBe(true);
        if (x.s2) expect(isSector(x.s2) && x.s2 !== x.s).toBe(true);
        if (x.m) expect((MILESTONES as readonly string[]).includes(x.m), x.m).toBe(true);
        expect(x.t.length).toBeGreaterThanOrEqual(3);
        expect(x.t.length).toBeLessThanOrEqual(160);
      }
    }
    // demo até 20 du depois da gravação (vídeo) e até 10 du depois das fotos
    const video = services.find((s) => s.slug === "producao-de-video")!;
    const vp = planRoadmap(toPlan(video.steps), start, "1900-01-01");
    const shoot = video.steps.findIndex((x) => x.m === "production_day");
    const demo = video.steps.findIndex((x) => x.m === "demo");
    expect(businessDaysBetween(vp[shoot].dueOn, vp[demo].dueOn)).toBeLessThanOrEqual(20);
    const foto = services.find((s) => s.slug === "producao-fotografica")!;
    const fp = planRoadmap(toPlan(foto.steps), start, "1900-01-01");
    expect(businessDaysBetween(fp[foto.steps.findIndex((x) => x.m === "production_day")].dueOn, fp[foto.steps.findIndex((x) => x.m === "demo")].dueOn)).toBeLessThanOrEqual(10);
    // "passar prazos ao cliente" é automática no Publipost
    expect(services.find((s) => s.slug === "publipost")!.steps.filter((x) => x.a).map((x) => x.t)).toContain("Passar os prazos ao cliente");
  });
});

describe("cliente, serviço e formulário", () => {
  it("cliente marca/herói/os dois e serviços que combinam", () => {
    expect(clientKindOf(true, false)).toBe("brand");
    expect(clientKindOf(false, true)).toBe("talent");
    expect(clientKindOf(true, true)).toBe("both");
    expect(clientKindOf(false, false)).toBeNull();
    expect(serviceFitsClient("talent", "talent")).toBe(true);
    expect(serviceFitsClient("talent", "brand")).toBe(false);
    expect(serviceFitsClient("talent", "both")).toBe(true);
    expect(serviceFitsClient("both", "brand")).toBe(true);
    expect(serviceFitsClient("brand", null)).toBe(false);
    expect(SECTORS).toEqual(["gestor", "estrategia", "operacao", "comunicacao"]);
  });

  it("serviço: mesmo dia leva 0 dias e sem recorrência; setor compartilhado diferente do principal", () => {
    const base = { id: "", name: "Serviço X", description: "", clientKind: "both", recurrence: "none", slaDays: 5, milestoneDays: null, milestoneLabel: "", active: true } as const;
    const step = { title: "Fazer algo", description: "", sector: "gestor", sectorExtra: "", dueRule: "same_day", dueDays: 3, recurrence: "weekly", dependsOnPrev: true, clientVisible: false, automatic: false, milestone: "" } as const;
    const parsed = serviceSaveSchema.parse({ ...base, steps: [step] });
    const payload = toServicePayload(parsed) as { steps: { due_days: number; recurrence: string }[]; milestone_days: unknown };
    expect(payload.steps[0].due_days).toBe(0);
    expect(payload.steps[0].recurrence).toBe("");
    expect(payload.milestone_days).toBe("");
    expect(serviceSaveSchema.safeParse({ ...base, steps: [{ ...step, sectorExtra: "gestor" }] }).success).toBe(false);
    expect(serviceSaveSchema.safeParse({ ...base, steps: [{ ...step, dueRule: "recurring", recurrence: "" }] }).success).toBe(false);
    expect(serviceSaveSchema.safeParse({ ...base, steps: [] }).success).toBe(false);
  });
});

describe("migração 0107, avisos e erros", () => {
  it("nada para o visitante; RPCs revogadas; avisos novos no check", () => {
    expect(MIGRATION).not.toMatch(/grant execute[^;]*to[^;]*\banon\b/i);
    expect(MIGRATION).not.toMatch(/\bdrop table\b/i);
    expect(MIGRATION).not.toMatch(/\bdrop column\b/i);
    for (const fn of ["agency_deal_open(uuid, jsonb)", "deal_roadmap(uuid)", "roadmap_task_set(uuid, boolean)", "client_projects()", "roadmap_today(uuid, text)", "roadmap_indicators(uuid, int)"])
      expect(MIGRATION).toContain(`revoke execute on function public.${fn} from public, anon;`);
    for (const fn of ["roadmap_recalc(uuid)", "deal_roadmap_generate(uuid, uuid, date)", "roadmap_alert_scan()", "agency_services_seed(uuid)"])
      expect(MIGRATION).toContain(`revoke execute on function public.${fn} from public, anon, authenticated;`);
    expect(INBOX_KINDS).toContain("roadmap_due_soon");
    expect(INBOX_KINDS).toContain("roadmap_overdue");
    expect(inboxKindPushes("roadmap_due_soon", "/agencia")).toBe(false);
    expect(inboxKindEmails("roadmap_overdue", "/agencia")).toBe(false);
  });

  it("códigos de erro novos traduzidos nos três idiomas", () => {
    for (const code of ["roadmap_started", "roadmap_exists", "client_required", "talent_agency_mismatch"]) {
      expect(AGENCY_ERROR_CODES).toContain(code);
      for (const locale of ["pt-BR", "en", "es"]) {
        const agency = JSON.parse(readFileSync(path.join(process.cwd(), "messages", locale, "agency.json"), "utf8")) as { errors: Record<string, string> };
        expect(agency.errors[code], `${locale} ${code}`).toBeTruthy();
      }
    }
    expect(agencyErrorCode({ message: "roadmap_started" })).toBe("roadmap_started");
    expect(agencyErrorCode({ message: "client_required" })).toBe("client_required");
  });
});
