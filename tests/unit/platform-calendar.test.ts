import { describe, expect, it } from "vitest";
import { eventDays, groupEventsByDay } from "@/lib/calendar/grid";
import { buildIcs } from "@/lib/calendar/ics";
import { toZonedIso } from "@/lib/deals/schemas";
import { platformEventToForm } from "@/lib/platform-calendar/form";
import {
  allowedActions,
  buildPreview,
  buildSourceKey,
  duplicateKey,
  editRow,
  isTentative,
  normalizeDate,
  normalizeTime,
  parseCsvImport,
  parseCsvRecords,
  parseJsonImport,
  previewSummary,
  toImportPayload,
} from "@/lib/platform-calendar/import";
import {
  collectionFromSource,
  effectiveStatus,
  filterAgenda,
  normalizeHashtags,
  parseAgendaFilters,
  territoryFromLabel,
  type PlatformInfo,
} from "@/lib/platform-calendar/vocab";

// JSON de teste no formato dos extratores (nunca vai ao banco)
const SAMPLE = {
  source: "Calendário Teste 2026 — Geral",
  year: 2026,
  events: [
    { title: "Ano Novo", start_date: "2026-01-01", end_date: null, all_day: true, territory: "Feriados Nacionais", description: null, hashtags: ["#AnoNovo"], highlight: false, source_page: 12, uncertain: false, note: null },
    { title: "Big Brother Teste", start_date: "2026-01-12", end_date: "2026-04-21", all_day: true, territory: "Entretenimento", description: "Reality", hashtags: ["#BBB", "bbb"], highlight: true, source_page: [12, 16], uncertain: false, note: null },
    { title: "Final incerta", start_date: "2026-11-29", end_date: null, all_day: true, territory: "Esporte", description: null, hashtags: [], highlight: false, source_page: 25, uncertain: true, note: "Marcado com *" },
    { title: "Data impossível", start_date: "2026-02-30", end_date: null, all_day: true, territory: "Moda", description: null, hashtags: [], highlight: false, source_page: 13, uncertain: false, note: null },
    { title: "Ano  novo", start_date: "2026-01-01", end_date: null, all_day: true, territory: "Galáxia", description: null, hashtags: [], highlight: false, source_page: 12, uncertain: false, note: null },
  ],
  months: [{ month: 1, label: "#JANEIRO 2026" }],
  quarters: [{ quarter: "Q1", trending_topics: ["#BBB"] }],
};

const info = (over: Partial<PlatformInfo> = {}): PlatformInfo => ({
  territory: null,
  status: "published",
  hashtags: [],
  highlight: false,
  tentative: false,
  category: null,
  collection: null,
  timezone: "America/Sao_Paulo",
  ...over,
});

describe("territórios, coleção e hashtags", () => {
  it("lê os rótulos do PDF e as chaves", () => {
    expect(territoryFromLabel("Futebol")).toBe("futebol");
    expect(territoryFromLabel("Geek & Tech")).toBe("geek_tech");
    expect(territoryFromLabel("Varejo & Comemorativas")).toBe("varejo");
    expect(territoryFromLabel("Feriados Nacionais")).toBe("feriados");
    expect(territoryFromLabel("Música")).toBe("musica");
    expect(territoryFromLabel("Saúde")).toBe("saude");
    expect(territoryFromLabel("Sustentabilidade")).toBe("sustentabilidade");
    expect(territoryFromLabel("esporte")).toBe("esporte");
    expect(territoryFromLabel("Causas")).toBe("social");
    expect(territoryFromLabel("geek_tech")).toBe("geek_tech");
    expect(territoryFromLabel("Galáxia")).toBeNull();
    expect(territoryFromLabel("")).toBeNull();
  });
  it("coleção vem do trecho depois do travessão, sem ano", () => {
    expect(collectionFromSource("Calendário Groscove 2026 — Geral")).toBe("geral");
    expect(collectionFromSource("Calendário Groscove 2026 — Sustentabilidade em Campo")).toBe("sustentabilidade-em-campo");
    expect(collectionFromSource("Cronograma 2027")).toBe("cronograma");
  });
  it("hashtags sem #, sem repetição e sem vazio", () => {
    expect(normalizeHashtags(["#BBB26", "bbb26", " #Final BBB ", ""])).toEqual(["BBB26", "FinalBBB"]);
    expect(normalizeHashtags("#a, #b;c")).toEqual(["a", "b", "c"]);
  });
});

describe("datas", () => {
  it("normaliza formatos comuns e recusa datas impossíveis", () => {
    expect(normalizeDate("2026-01-05")).toBe("2026-01-05");
    expect(normalizeDate("2026/1/5")).toBe("2026-01-05");
    expect(normalizeDate("05/01/2026")).toBe("2026-01-05");
    expect(normalizeDate("5.1.26")).toBe("2026-01-05");
    expect(normalizeDate("05/01", 2027)).toBe("2027-01-05");
    expect(normalizeDate("05/01")).toBeNull();
    expect(normalizeDate("2026-02-30")).toBeNull();
    expect(normalizeDate("31/04/2026")).toBeNull();
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeTime("9h30")).toBe("09:30");
    expect(normalizeTime("")).toBe("");
    expect(normalizeTime("25:00")).toBeNull();
  });
  it("programado vira publicado quando a data chega (sem cron)", () => {
    const now = new Date("2026-11-04T12:00:00Z");
    expect(effectiveStatus("scheduled", "2026-11-04T11:00:00Z", now)).toBe("published");
    expect(effectiveStatus("scheduled", "2026-11-05T00:00:00Z", now)).toBe("scheduled");
    expect(effectiveStatus("draft", null, now)).toBe("draft");
    expect(effectiveStatus("cancelled", "2026-01-01T00:00:00Z", now)).toBe("cancelled");
  });
});

describe("chave estável e duplicidade", () => {
  it("source_key: fonte + data + título, ASCII, até 120, estável", () => {
    const k = buildSourceKey("Calendário Groscove 2026 — Geral", "2026-01-01", "Ano Novo");
    expect(k).toBe("gc:calendario-groscove-2026-geral:2026-01-01:ano-novo");
    expect(buildSourceKey("Calendário Groscove 2026 — Geral", "2026-01-01", "Ano Novo")).toBe(k);
    const long = buildSourceKey("Calendário Groscove 2026 — Geral", "2026-01-01", "x".repeat(50) + " " + "y".repeat(80));
    const long2 = buildSourceKey("Calendário Groscove 2026 — Geral", "2026-01-01", "x".repeat(50) + " " + "z".repeat(80));
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long).toMatch(/^[a-z0-9][a-z0-9:._-]{0,119}$/);
    expect(long).not.toBe(long2);
  });
  it("duplicidade por título + data ignora acento, caixa e espaços", () => {
    expect(duplicateKey("Dia da  Mulher!", "2026-03-08")).toBe(duplicateKey("dia da mulher", "2026-03-08"));
    expect(duplicateKey("Dia da Mulher", "2026-03-08")).not.toBe(duplicateKey("Dia da Mulher", "2026-03-09"));
  });
  it("data a confirmar nas três variações dos arquivos", () => {
    expect(isTentative({ tentative: true })).toBe(true);
    expect(isTentative({ tentative: false, uncertain: true })).toBe(false);
    expect(isTentative({ uncertain: true })).toBe(true);
    expect(isTentative({ uncertain: false, note: "Marcada com * no PDF: data prevista sem confirmação até o momento." })).toBe(true);
    expect(isTentative({ uncertain: false, note: null })).toBe(false);
  });
});

describe("leitura de JSON e CSV + pré-visualização", () => {
  it("JSON dos extratores: metadados guardados, linhas validadas, repetida e erro ignoradas", () => {
    const parsed = parseJsonImport(JSON.stringify(SAMPLE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.year).toBe(2026);
    expect(parsed.file.meta.months).toEqual(SAMPLE.months);
    expect(parsed.file.meta.quarters).toEqual(SAMPLE.quarters);
    const rows = buildPreview(parsed.file, []);
    expect(rows.map((r) => r.action)).toEqual(["create", "create", "create", "skip", "skip"]);
    expect(rows[1].hashtags).toEqual(["BBB"]);
    expect(rows[1].sourcePage).toEqual([12, 16]);
    expect(rows[2].tentative).toBe(true);
    expect(rows[2].status).toBe("published");
    expect(rows[3].errors).toContain("start_date");
    expect(rows[4].duplicate?.kind).toBe("file");
    expect(rows[4].warnings).toContain("territory_unknown");
    expect(previewSummary(rows)).toMatchObject({ total: 5, create: 3, skip: 2, errors: 1, duplicates: 1, tentative: 1 });
  });
  it("reimportar: a mesma chave vira 'ignorar' (ou 'atualizar'); título+data com outra chave aponta o evento", () => {
    const parsed = parseJsonImport(JSON.stringify(SAMPLE));
    if (!parsed.ok) throw new Error("parse");
    const first = buildPreview(parsed.file, []);
    const existing = [
      { id: "e1", sourceKey: first[0].sourceKey, title: "Ano Novo", startDate: "2026-01-01" },
      { id: "e2", sourceKey: "gc:outra:2026-11-29:final", title: "FINAL INCERTA", startDate: "2026-11-29" },
    ];
    const again = buildPreview(parsed.file, existing);
    expect(again[0].duplicate).toMatchObject({ kind: "key", targetId: "e1" });
    expect(again[0].action).toBe("skip");
    expect(allowedActions(again[0])).toEqual(["skip", "update"]);
    expect(again[2].duplicate).toMatchObject({ kind: "title_date", targetId: "e2" });
    expect(allowedActions(again[2])).toEqual(["skip", "update", "create"]);
    const payload = toImportPayload([editRow(again[0], { action: "update" }), editRow(again[2], { action: "update" })], { source: SAMPLE.source, timeZone: "America/Sao_Paulo", toZoned: toZonedIso });
    expect(payload[0]).toMatchObject({ action: "update", target_id: "e1", source_key: first[0].sourceKey, collection: "geral" });
    expect(payload[1]).toMatchObject({ action: "update", target_id: "e2", tentative: true, extra: { uncertain: true, note: "Marcado com *", source_page: 25 } });
  });
  it("correção na pré-visualização revalida e mantém a chave original", () => {
    const parsed = parseJsonImport(JSON.stringify(SAMPLE));
    if (!parsed.ok) throw new Error("parse");
    const rows = buildPreview(parsed.file, []);
    const fixed = editRow(rows[3], { startDate: "28/02/2026" }, 2026);
    expect(fixed.errors).toEqual([]);
    expect(fixed.startDate).toBe("2026-02-28");
    expect(fixed.sourceKey).toBe(rows[3].sourceKey);
    expect(fixed.action).toBe("skip");
    expect(editRow(fixed, { action: "create" }).action).toBe("create");
    expect(editRow(rows[0], { endDate: "2025-12-31" }).errors).toContain("end_date");
    expect(editRow(rows[0], { endDate: "2027-06-01" }).errors).toContain("span");
    expect(editRow(rows[0], { territory: "musica" }).territory).toBe("musica");
  });
  it("JSON inválido, sem events ou vazio", () => {
    expect(parseJsonImport("{")).toEqual({ ok: false, error: "invalid_json" });
    expect(parseJsonImport("[]")).toEqual({ ok: false, error: "invalid_format" });
    expect(parseJsonImport('{"events":[]}')).toEqual({ ok: false, error: "empty" });
  });
  it("CSV com aspas, ponto e vírgula e cabeçalho em português", () => {
    expect(parseCsvRecords('a,b\n"x, y","com ""aspas"""\n')).toEqual([
      ["a", "b"],
      ["x, y", 'com "aspas"'],
    ]);
    const csv = "titulo;data_inicio;data_fim;territorio;descricao;hashtags;destaque\nCarnaval;14/02/2026;17/02/2026;Entretenimento;\"Folia; muita\";#Carnaval #Folia;sim\n";
    const parsed = parseCsvImport(csv, "Planilha 2026");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const [row] = buildPreview(parsed.file, []);
    expect(row).toMatchObject({ title: "Carnaval", startDate: "2026-02-14", endDate: "2026-02-17", territory: "entretenimento", description: "Folia; muita", hashtags: ["Carnaval", "Folia"], highlight: true });
    expect(parseCsvImport("x,y\n1,2", "s")).toEqual({ ok: false, error: "invalid_csv" });
  });
  it("lote com hora usa o fuso do evento", () => {
    const parsed = parseCsvImport("title,start_date,start_time,end_time\nShow,2026-12-05,20:00,23:00\n", "s");
    if (!parsed.ok) throw new Error("parse");
    const [ev] = toImportPayload(buildPreview(parsed.file, []), { source: "s", timeZone: "America/Manaus", toZoned: toZonedIso });
    expect(ev).toMatchObject({ all_day: false, starts_at: "2026-12-05T20:00:00-04:00", ends_at: "2026-12-05T23:00:00-04:00" });
  });
});

describe("agenda: filtros e grade", () => {
  const own = { id: "o", platform: null };
  const fut = { id: "f", platform: info({ territory: "futebol", collection: "geral" }) };
  const sus = { id: "s", platform: info({ territory: "sustentabilidade", collection: "sustentabilidade-em-campo" }) };
  it("tudo / só Groscove / só meus, território e coleção", () => {
    const all = [own, fut, sus];
    expect(filterAgenda(all, parseAgendaFilters({})).map((e) => e.id)).toEqual(["o", "f", "s"]);
    expect(filterAgenda(all, parseAgendaFilters({ cal: "groscove" })).map((e) => e.id)).toEqual(["f", "s"]);
    expect(filterAgenda(all, parseAgendaFilters({ cal: "mine" })).map((e) => e.id)).toEqual(["o"]);
    expect(filterAgenda(all, parseAgendaFilters({ territorio: "futebol" })).map((e) => e.id)).toEqual(["o", "f"]);
    expect(filterAgenda(all, parseAgendaFilters({ colecao: "sustentabilidade-em-campo", cal: "groscove" })).map((e) => e.id)).toEqual(["s"]);
    expect(parseAgendaFilters({ cal: "x", territorio: "politica", colecao: "../x" })).toEqual({ mode: "all", territory: null, collection: null });
  });
  it("temporada longa aparece só no primeiro e no último dia", () => {
    const season = { startsAt: "2026-04-01T03:00:00Z", endsAt: "2026-12-07T03:00:00Z", allDay: true, edgesOnly: true, title: "Brasileirão" };
    expect(eventDays(season, "America/Sao_Paulo")).toEqual(["2026-04-01", "2026-12-06"]);
    const map = groupEventsByDay([season], "America/Sao_Paulo", { first: "2026-03-30", last: "2026-05-03" });
    expect([...map.keys()]).toEqual(["2026-04-01"]);
  });
  it("evento salvo volta para o formulário no fuso dele", () => {
    const form = platformEventToForm({
      id: "x",
      title: "Natal",
      description: "",
      location: "",
      territory: "feriados",
      category: null,
      collection: "geral",
      hashtags: ["Natal"],
      highlight: false,
      tentative: true,
      allDay: true,
      startsAt: "2026-12-25T03:00:00Z",
      endsAt: "2026-12-26T03:00:00Z",
      timezone: "America/Sao_Paulo",
      status: "scheduled",
      publishedAt: "2026-12-01T12:00:00Z",
    });
    expect(form).toMatchObject({ date: "2026-12-25", endDate: "", hashtags: "#Natal", publishDate: "2026-12-01", publishTime: "09:00", tentative: true });
  });
  it(".ics marca o cancelado", () => {
    const ics = buildIcs([{ id: "a", title: "Show", startsAt: "2026-12-05T23:00:00Z", endsAt: "2026-12-06T02:00:00Z", allDay: false, cancelled: true }], { calendarName: "x", timeZone: "America/Sao_Paulo", now: new Date("2026-11-04T00:00:00Z") });
    expect(ics).toContain("STATUS:CANCELLED");
  });
});
