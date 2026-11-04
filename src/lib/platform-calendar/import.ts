// Importação do Calendário Groscove (0098): leitura de JSON (formato dos extratores) e CSV, normalização de datas,
// chave estável (source_key), detecção de duplicidade e montagem do lote para a RPC platform_events_import.
// Lógica pura (navegador, servidor e scripts/import-platform-calendar.ts), testada em tests/unit/platform-calendar.test.ts.
//
// Decisões:
//   • source_key = "gc:<fonte>:<AAAA-MM-DD>:<título>" (slugs ASCII) — estável por fonte + título + data de início ORIGINAIS
//     do arquivo. Corrigir título/data na pré-visualização NÃO muda a chave: reimportar o mesmo arquivo continua batendo.
//     Título longo é cortado e ganha um sufixo de hash (FNV-1a) do título inteiro, para não colidir.
//   • "Data a confirmar" (asterisco do PDF): tentative=true, ou uncertain=true quando o arquivo não tem o campo tentative
//     (2026 Geral), ou a observação diz "sem confirmação" (Sustentabilidade). O evento entra PUBLICADO com o selo.
//     uncertain (dúvida do extratora) fica em extra para o admin.
//   • Duplicidade: mesma chave já no banco → "ignorar" (padrão) ou "atualizar"; mesmo título + data (normalizados) com
//     outra chave → "ignorar" (padrão), "atualizar" aquele evento ou "criar mesmo assim"; repetida no próprio arquivo → ignorar.

import { plusDays } from "@/lib/calendar/ics";
import { collectionFromSource, normalizeHashtags, normalizeText, slugify, territoryFromLabel, type Territory } from "./vocab";

export const MAX_IMPORT_ROWS = 2000;
export const MAX_SPAN_DAYS = 366;

/** Linha bruta (antes da validação), vinda do JSON ou do CSV. */
export type RawImportRow = {
  title: string;
  startDate: string;
  endDate: string;
  territoryRaw: string;
  description: string;
  hashtags: string[];
  highlight: boolean;
  tentative: boolean;
  uncertain: boolean;
  category: string;
  note: string;
  sourcePage: number | number[] | null;
  startTime: string;
  endTime: string;
};

export type ParsedFile = {
  format: "json" | "csv";
  source: string;
  year: number | null;
  rows: RawImportRow[];
  /** months, quarters e o resto do cabeçalho (legenda, about) — guardados na importação. */
  meta: Record<string, unknown>;
};

export type ParseResult = { ok: true; file: ParsedFile } | { ok: false; error: "invalid_json" | "invalid_format" | "empty" | "too_many" | "invalid_csv" };

export type RowError = "title" | "start_date" | "end_date" | "span" | "description" | "time";
export type RowWarning = "territory_unknown" | "date_fixed" | "tentative" | "uncertain";
export type Duplicate = { kind: "key" | "title_date" | "file"; targetId: string | null; targetTitle: string | null };
export type RowAction = "create" | "update" | "skip";

/** Linha da pré-visualização (editável). */
export type PreviewRow = {
  index: number;
  sourceKey: string;
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  territory: Territory | null;
  territoryRaw: string;
  description: string;
  hashtags: string[];
  highlight: boolean;
  tentative: boolean;
  uncertain: boolean;
  category: string;
  note: string;
  sourcePage: number | number[] | null;
  status: "published" | "draft";
  errors: RowError[];
  warnings: RowWarning[];
  duplicate: Duplicate | null;
  action: RowAction;
};

/** Evento que já existe na plataforma (para achar duplicidade). startDate no fuso do evento. */
export type ExistingEvent = { id: string; sourceKey: string | null; title: string; startDate: string };

const pad = (n: number) => String(n).padStart(2, "0");

function validYmd(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Data em AAAA-MM-DD a partir de "AAAA-MM-DD", "AAAA/MM/DD", "DD/MM/AAAA", "DD-MM-AAAA", "DD.MM.AAAA", "DD/MM/AA" ou
 * "DD/MM" (usa o ano padrão). Data impossível (31/02) ou fora de 2000–2100 → null.
 */
export function normalizeDate(value: unknown, defaultYear?: number | null): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validYmd(y, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m && defaultYear) return validYmd(defaultYear, Number(m[2]), Number(m[1]));
  return null;
}

/** "HH:MM" válido ou "" (vazio = dia inteiro). Inválido → null. */
export function normalizeTime(value: unknown): string | null {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return "";
  const m = /^(\d{1,2})[:h](\d{2})$/.exec(s);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${pad(Number(m[1]))}:${m[2]}`;
}

/** Dias entre duas datas AAAA-MM-DD (fim - início). */
export function daysBetween(start: string, end: string): number {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  return Math.round((Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds)) / 86_400_000);
}

/** FNV-1a 32 bits em hexadecimal (8 dígitos): curto, estável e igual em qualquer ambiente. */
export function shortHash(value: string): string {
  let h = 0x811c9dc5;
  for (const ch of new TextEncoder().encode(value)) {
    h ^= ch;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Chave estável do evento: gc:<fonte>:<data>:<título> (até 120 caracteres; só a-z 0-9 : . _ -). */
export function buildSourceKey(source: string, startDate: string, title: string): string {
  const src = (slugify(source) || "fonte").slice(0, 40).replace(/-+$/, "");
  const prefix = `gc:${src}:${startDate}:`;
  const full = slugify(title) || "evento";
  const room = 120 - prefix.length;
  if (full.length <= room) return prefix + full;
  return `${prefix}${full.slice(0, room - 9).replace(/-+$/, "")}-${shortHash(full)}`;
}

/** Chave de duplicidade por conteúdo: data de início + título normalizado (sem acento, caixa ou pontuação). */
export function duplicateKey(title: string, startDate: string): string {
  return `${startDate}|${normalizeText(title)}`;
}

/** "Data a confirmar" (asterisco do PDF), nas três variações dos arquivos. */
export function isTentative(raw: { tentative?: unknown; uncertain?: unknown; note?: unknown }): boolean {
  if (raw.tentative === true) return true;
  if (raw.tentative === undefined && raw.uncertain === true) return true;
  return typeof raw.note === "string" && /sem confirma[cç][aã]o/i.test(raw.note);
}

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const bool = (v: unknown) => v === true || (typeof v === "string" && /^(1|true|sim|s|yes|y|x)$/i.test(v.trim()));

function sourcePageOf(v: unknown): number | number[] | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (Array.isArray(v)) {
    const list = v.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    return list.length > 0 ? list : null;
  }
  return null;
}

/** JSON dos extratores: {source, year, events:[…], months?, quarters?, …}. */
export function parseJsonImport(text: string, fallbackSource = ""): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "invalid_format" };
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.events)) return { ok: false, error: "invalid_format" };
  if (obj.events.length === 0) return { ok: false, error: "empty" };
  if (obj.events.length > MAX_IMPORT_ROWS) return { ok: false, error: "too_many" };
  const rows: RawImportRow[] = obj.events.map((value) => {
    const e = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    return {
      title: str(e.title),
      startDate: str(e.start_date),
      endDate: str(e.end_date),
      territoryRaw: str(e.territory),
      description: str(e.description),
      hashtags: normalizeHashtags(e.hashtags),
      highlight: e.highlight === true,
      tentative: isTentative(e),
      uncertain: e.uncertain === true,
      category: str(e.category).trim(),
      note: str(e.note),
      sourcePage: sourcePageOf(e.source_page),
      startTime: e.all_day === false ? str(e.start_time) : "",
      endTime: e.all_day === false ? str(e.end_time) : "",
    };
  });
  const year = typeof obj.year === "number" && Number.isInteger(obj.year) ? obj.year : null;
  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (k !== "events" && k !== "source" && k !== "year") meta[k] = v;
  return { ok: true, file: { format: "json", source: str(obj.source).trim() || fallbackSource, year, rows, meta } };
}

/** CSV (RFC 4180: aspas, aspas dobradas, quebra de linha dentro de aspas). Separador "," ou ";" (o da 1ª linha). */
export function parseCsvRecords(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) out.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) out.push(row);
  return out;
}

// cabeçalhos aceitos (inglês do pedido e português)
const CSV_COLUMNS: Record<string, keyof RawImportRow | "all_day"> = {
  title: "title",
  titulo: "title",
  start_date: "startDate",
  data_inicio: "startDate",
  inicio: "startDate",
  data: "startDate",
  end_date: "endDate",
  data_fim: "endDate",
  fim: "endDate",
  territory: "territoryRaw",
  territorio: "territoryRaw",
  description: "description",
  descricao: "description",
  hashtags: "hashtags",
  highlight: "highlight",
  destaque: "highlight",
  tentative: "tentative",
  a_confirmar: "tentative",
  category: "category",
  categoria: "category",
  note: "note",
  observacao: "note",
  start_time: "startTime",
  hora_inicio: "startTime",
  end_time: "endTime",
  hora_fim: "endTime",
};

/** CSV: title,start_date,end_date,territory,description,hashtags,highlight (+ opcionais). */
export function parseCsvImport(text: string, source: string, year: number | null = null): ParseResult {
  const records = parseCsvRecords(text);
  if (records.length < 2) return { ok: false, error: records.length === 0 ? "empty" : "invalid_csv" };
  const header = records[0].map((h) => normalizeText(h).replace(/\s+/g, "_"));
  const cols = header.map((h) => CSV_COLUMNS[h] ?? null);
  if (!cols.includes("title") || !cols.includes("startDate")) return { ok: false, error: "invalid_csv" };
  const body = records.slice(1);
  if (body.length > MAX_IMPORT_ROWS) return { ok: false, error: "too_many" };
  const rows: RawImportRow[] = body.map((rec) => {
    const get = (key: string) => {
      const i = cols.indexOf(key as never);
      return i >= 0 ? (rec[i] ?? "").trim() : "";
    };
    return {
      title: get("title"),
      startDate: get("startDate"),
      endDate: get("endDate"),
      territoryRaw: get("territoryRaw"),
      description: get("description"),
      hashtags: normalizeHashtags(get("hashtags")),
      highlight: bool(get("highlight")),
      tentative: bool(get("tentative")) || /sem confirma[cç][aã]o/i.test(get("note")),
      uncertain: false,
      category: get("category"),
      note: get("note"),
      sourcePage: null,
      startTime: get("startTime"),
      endTime: get("endTime"),
    };
  });
  return { ok: true, file: { format: "csv", source, year, rows, meta: {} } };
}

/** Valida/normaliza uma linha (usada ao montar e a cada correção na pré-visualização). */
export function validateRow(row: Omit<PreviewRow, "errors" | "warnings">, defaultYear?: number | null): Pick<PreviewRow, "errors" | "warnings" | "startDate" | "endDate" | "title" | "startTime" | "endTime"> {
  const errors: RowError[] = [];
  const warnings: RowWarning[] = [];
  const title = row.title.replace(/\s+/g, " ").trim();
  if (title.length < 1 || title.length > 160) errors.push("title");
  const start = normalizeDate(row.startDate, defaultYear);
  if (!start) errors.push("start_date");
  else if (start !== row.startDate.trim()) warnings.push("date_fixed");
  let end = row.endDate.trim() ? normalizeDate(row.endDate, defaultYear) : "";
  if (end === null) errors.push("end_date");
  if (start && end && end === start) end = "";
  if (start && end && end < start) errors.push("end_date");
  if (start && end && end >= start && daysBetween(start, end) > MAX_SPAN_DAYS) errors.push("span");
  if (row.description.length > 2000) errors.push("description");
  const startTime = normalizeTime(row.startTime);
  const endTime = normalizeTime(row.endTime);
  if (startTime === null || endTime === null || (startTime === "" && endTime !== "")) errors.push("time");
  if (row.territoryRaw.trim() && !row.territory) warnings.push("territory_unknown");
  if (row.tentative) warnings.push("tentative");
  if (row.uncertain) warnings.push("uncertain");
  return { errors, warnings, title, startDate: start ?? row.startDate, endDate: end ?? row.endDate, startTime: startTime ?? row.startTime, endTime: endTime ?? row.endTime };
}

/** Monta a pré-visualização: valida, gera a chave e marca duplicidades (banco e arquivo). */
export function buildPreview(file: ParsedFile, existing: readonly ExistingEvent[]): PreviewRow[] {
  const byKey = new Map(existing.filter((e) => e.sourceKey).map((e) => [e.sourceKey as string, e]));
  const byContent = new Map(existing.map((e) => [duplicateKey(e.title, e.startDate), e]));
  const seenKeys = new Set<string>();
  const seenContent = new Set<string>();
  return file.rows.map((raw, index) => {
    const territory = territoryFromLabel(raw.territoryRaw);
    const base = {
      index,
      sourceKey: "",
      title: raw.title,
      startDate: raw.startDate,
      endDate: raw.endDate,
      startTime: raw.startTime,
      endTime: raw.endTime,
      territory,
      territoryRaw: raw.territoryRaw,
      description: raw.description.trim(),
      hashtags: raw.hashtags,
      highlight: raw.highlight,
      tentative: raw.tentative,
      uncertain: raw.uncertain,
      category: raw.category,
      note: raw.note,
      sourcePage: raw.sourcePage,
      status: "published" as const,
      duplicate: null,
      action: "create" as RowAction,
    };
    const v = validateRow(base, file.year);
    const row: PreviewRow = { ...base, ...v };
    const keyDate = normalizeDate(raw.startDate, file.year) ?? raw.startDate.trim();
    row.sourceKey = buildSourceKey(file.source, keyDate, raw.title);
    const content = duplicateKey(row.title, row.startDate);
    const atKey = byKey.get(row.sourceKey);
    const atContent = byContent.get(content);
    if (seenKeys.has(row.sourceKey) || seenContent.has(content)) row.duplicate = { kind: "file", targetId: null, targetTitle: null };
    else if (atKey) row.duplicate = { kind: "key", targetId: atKey.id, targetTitle: atKey.title };
    else if (atContent) row.duplicate = { kind: "title_date", targetId: atContent.id, targetTitle: atContent.title };
    seenKeys.add(row.sourceKey);
    seenContent.add(content);
    row.action = row.errors.length > 0 || row.duplicate ? "skip" : "create";
    return row;
  });
}

/** Ações possíveis para a linha (erro: só ignorar; repetida no arquivo: só ignorar). */
export function allowedActions(row: PreviewRow): RowAction[] {
  if (row.errors.length > 0 || row.duplicate?.kind === "file") return ["skip"];
  if (row.duplicate?.kind === "key") return ["skip", "update"];
  if (row.duplicate?.kind === "title_date") return ["skip", "update", "create"];
  return ["create", "skip"];
}

/** Aplica uma correção (título, datas, território…) e revalida, mantendo a chave e a ação quando ainda permitida. */
export function editRow(row: PreviewRow, patch: Partial<Pick<PreviewRow, "title" | "startDate" | "endDate" | "territory" | "description" | "highlight" | "tentative" | "status" | "action">>, defaultYear?: number | null): PreviewRow {
  const next = { ...row, ...patch };
  if (patch.territory !== undefined) next.territoryRaw = patch.territory ?? "";
  const v = validateRow(next, defaultYear);
  const out: PreviewRow = { ...next, ...v };
  if (!allowedActions(out).includes(out.action)) out.action = out.errors.length > 0 ? "skip" : allowedActions(out)[0];
  return out;
}

/** Contagens da pré-visualização. */
export function previewSummary(rows: readonly PreviewRow[]) {
  return {
    total: rows.length,
    create: rows.filter((r) => r.action === "create").length,
    update: rows.filter((r) => r.action === "update").length,
    skip: rows.filter((r) => r.action === "skip").length,
    errors: rows.filter((r) => r.errors.length > 0).length,
    duplicates: rows.filter((r) => r.duplicate).length,
    tentative: rows.filter((r) => r.tentative).length,
  };
}

/** Evento do lote no formato da RPC platform_events_import. */
export type ImportPayloadEvent = {
  source_key: string;
  action: RowAction;
  target_id: string | null;
  title: string;
  all_day: boolean;
  start_date: string;
  end_date: string | null;
  starts_at?: string;
  ends_at?: string;
  timezone: string;
  territory: Territory | null;
  description: string;
  hashtags: string[];
  highlight: boolean;
  tentative: boolean;
  category: string | null;
  collection: string | null;
  status: "published" | "draft";
  extra: Record<string, unknown>;
};

/**
 * Linhas → lote da RPC. "Criar mesmo assim" (duplicidade por título+data) vai sem alvo; "atualizar" vai com o id do
 * evento encontrado. Com hora: starts_at/ends_at com o deslocamento do fuso (toZoned recebe a conversão do app).
 */
export function toImportPayload(rows: readonly PreviewRow[], opts: { source: string; timeZone: string; toZoned: (date: string, time: string, tz: string) => string | null }): ImportPayloadEvent[] {
  const collection = collectionFromSource(opts.source);
  return rows.map((r) => {
    const timed = r.startTime !== "";
    const endDate = r.endDate || r.startDate;
    const extra: Record<string, unknown> = {};
    if (r.sourcePage !== null) extra.source_page = r.sourcePage;
    if (r.uncertain) extra.uncertain = true;
    if (r.note.trim()) extra.note = r.note.trim().slice(0, 1000);
    const ev: ImportPayloadEvent = {
      source_key: r.sourceKey,
      action: r.action,
      target_id: r.action === "update" && r.duplicate?.targetId ? r.duplicate.targetId : null,
      title: r.title,
      all_day: !timed,
      start_date: r.startDate,
      end_date: r.endDate || null,
      timezone: opts.timeZone,
      territory: r.territory,
      description: r.description.slice(0, 2000),
      hashtags: r.hashtags,
      highlight: r.highlight,
      tentative: r.tentative,
      category: r.category.trim() ? r.category.trim().slice(0, 60) : null,
      collection,
      status: r.status,
      extra,
    };
    if (timed) {
      ev.starts_at = opts.toZoned(r.startDate, r.startTime, opts.timeZone) ?? undefined;
      ev.ends_at = opts.toZoned(endDate, r.endTime || r.startTime, opts.timeZone) ?? undefined;
    }
    return ev;
  });
}

/** Último dia (inclusivo) de um evento de dia inteiro com fim exclusivo. */
export function inclusiveEndDate(endExclusiveDate: string): string {
  return plusDays(endExclusiveDate, -1);
}
