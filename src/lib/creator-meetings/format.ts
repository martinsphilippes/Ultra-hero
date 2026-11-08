// Ata de reunião com o Hero (0138): o modelo A–K do guia da Groscove, o checklist pós-reunião, o que falta para
// concluir e o texto da ata para copiar. Lógica pura, compartilhada pela ficha do casting, pelos encaminhamentos e
// pelos testes. O banco confere tudo de novo.

import { type ActionInterest, FORMAT_KEYS, type FormatKey, type Formats, isActionInterest, parseFormats } from "@/lib/creator-guide/format";

export const MEETING_TZ = "America/Sao_Paulo";

export const MEETING_MODES = ["online", "in_person"] as const;
export type MeetingMode = (typeof MEETING_MODES)[number];
export const MEETING_STATUSES = ["draft", "final"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];
export const OWNER_KINDS = ["team", "talent"] as const;
export type OwnerKind = (typeof OWNER_KINDS)[number];
export const ACTION_STATUSES = ["pending", "done"] as const;
export type MeetingActionStatus = (typeof ACTION_STATUSES)[number];
export const YES_NO = ["yes", "no"] as const;
export type YesNo = (typeof YES_NO)[number];
export const INTERNAL_DATA = ["received", "pending"] as const;
export type InternalData = (typeof INTERNAL_DATA)[number];

/** Campos de texto da ata com o limite de cada um (iguais aos do banco). */
export const NOTE_LIMITS = {
  profile_topics: 1000,
  profile_platforms: 1000,
  profile_audience: 1000,
  profile_public: 600,
  profile_frequency: 600,
  brands_affinity: 600,
  brands_worked: 600,
  past_campaigns: 1000,
  rates: 600,
  conflicts: 600,
  action_categories: 300,
  action_availability: 500,
  action_dates: 500,
  project_name: 120,
  project_concept: 1500,
  project_format: 300,
  project_stage: 300,
  project_next: 500,
  materials_notes: 600,
  open_questions: 2000,
  summary: 2000,
} as const;
export type NoteKey = keyof typeof NOTE_LIMITS;
export const NOTE_KEYS = Object.keys(NOTE_LIMITS) as NoteKey[];
export type Notes = Partial<Record<NoteKey, string>>;

/** Que campos de texto ficam em cada seção da ata. */
export const SECTION_NOTES = {
  B: ["profile_topics", "profile_platforms", "profile_audience", "profile_public", "profile_frequency"],
  C: ["brands_affinity", "brands_worked", "past_campaigns", "rates", "conflicts"],
  E: ["action_categories", "action_availability", "action_dates"],
  F: ["project_name", "project_concept", "project_format", "project_stage", "project_next"],
  G: ["materials_notes"],
  H: ["open_questions"],
  J: ["summary"],
} as const satisfies Record<string, readonly NoteKey[]>;

/** Campos longos (caixa de texto maior). */
export const LONG_NOTES: readonly NoteKey[] = ["profile_topics", "profile_audience", "past_campaigns", "project_concept", "open_questions", "summary"];

export const REGISTRATION_KEYS = ["reg_full_name", "reg_artistic_name", "reg_address", "reg_phone", "reg_email", "reg_city"] as const;
export type RegistrationKey = (typeof REGISTRATION_KEYS)[number];
export const K_KEYS = [
  "k_reviewed",
  "k_saved",
  "k_shared",
  "k_presidency",
  "k_follow_up_sent",
  "k_media_kit_requested",
  "k_calendar_sent",
  "k_questions_forwarded",
] as const;
export type KKey = (typeof K_KEYS)[number];
export type Checks = Partial<Record<RegistrationKey | KKey, true>> & { media_kit?: YesNo; channels_insights?: YesNo; internal_data?: InternalData };

export type MeetingAction = {
  id: string | null;
  title: string;
  ownerKind: OwnerKind;
  ownerId: string | null;
  owner: string | null;
  dueOn: string | null;
  status: MeetingActionStatus;
};

export const MAX_ACTIONS = 20;
export const ACTION_TITLE_MAX = 200;
export const LIMITS = { participants: 500, fullName: 160, contactFix: 300 } as const;

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
export const isMeetingMode = (v: unknown): v is MeetingMode => isOneOf(MEETING_MODES, v);
export const isMeetingStatus = (v: unknown): v is MeetingStatus => isOneOf(MEETING_STATUSES, v);

/** JSON do banco → textos da ata (o que vier estranho é ignorado). */
export function parseNotes(v: unknown): Notes {
  const out: Notes = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const key of NOTE_KEYS) {
    const raw = (v as Record<string, unknown>)[key];
    if (typeof raw === "string" && raw.trim()) out[key] = raw;
  }
  return out;
}

/** JSON do banco → caixas marcadas de G e K. */
export function parseChecks(v: unknown): Checks {
  const out: Checks = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  const r = v as Record<string, unknown>;
  for (const key of [...REGISTRATION_KEYS, ...K_KEYS]) if (r[key] === true) out[key] = true;
  if (isOneOf(YES_NO, r.media_kit)) out.media_kit = r.media_kit;
  if (isOneOf(YES_NO, r.channels_insights)) out.channels_insights = r.channels_insights;
  if (isOneOf(INTERNAL_DATA, r.internal_data)) out.internal_data = r.internal_data;
  return out;
}

export { parseFormats, isActionInterest };

// ------------------------------------------------------------------ checklist pós-reunião (seção 13 + K)

/** Os 11 itens do "não encerrar sem concluir". Três se completam sozinhos pelo que a ata já diz. */
export const POST_ITEMS = [
  "k_reviewed",
  "k_saved",
  "k_shared",
  "k_presidency",
  "k_follow_up_sent",
  "k_media_kit_requested",
  "registration",
  "k_calendar_sent",
  "formats",
  "k_questions_forwarded",
  "follow_up",
] as const;
export type PostItem = (typeof POST_ITEMS)[number];
export type PostInput = { checks: Checks; formatsAnswered: number; hasQuestions: boolean; followUpOn: string | null; actionsReady: number };
/** auto = a própria ata responde (sem caixa para marcar). */
export type PostState = { item: PostItem; done: boolean; auto: boolean };

export function postChecklist(input: PostInput): PostState[] {
  return POST_ITEMS.map((item): PostState => {
    switch (item) {
      case "registration":
        return { item, done: REGISTRATION_KEYS.every((k) => input.checks[k] === true), auto: true };
      case "formats":
        return { item, done: input.formatsAnswered >= FORMAT_KEYS.length, auto: true };
      case "follow_up":
        return { item, done: Boolean(input.followUpOn) && input.actionsReady > 0, auto: true };
      case "k_questions_forwarded":
        // sem dúvida pendente (H vazio) não há o que encaminhar
        return input.hasQuestions ? { item, done: input.checks.k_questions_forwarded === true, auto: false } : { item, done: true, auto: true };
      case "k_media_kit_requested":
        // media kit já recebido dispensa o pedido
        return input.checks.media_kit === "yes" ? { item, done: true, auto: true } : { item, done: input.checks.k_media_kit_requested === true, auto: false };
      default:
        return { item, done: input.checks[item] === true, auto: false };
    }
  });
}

export function postProgress(states: readonly PostState[]): { done: number; total: number } {
  return { done: states.filter((s) => s.done).length, total: states.length };
}

// ------------------------------------------------------------------ concluir

export const FINALIZE_PROBLEMS = ["heldAt", "representative", "summary", "actions", "followUp", "project"] as const;
/** Folga para concluir: a reunião precisa ter acontecido (até 1 hora à frente, como no banco). */
export const HELD_AT_SLACK_MS = 60 * 60 * 1000;
export type FinalizeProblem = (typeof FINALIZE_PROBLEMS)[number];
export const SUMMARY_MIN = 10;

/** Encaminhamento pronto: tem responsável (alguém da equipe ou o Hero) e prazo. */
export function actionReady(a: Pick<MeetingAction, "title" | "ownerKind" | "ownerId" | "dueOn">): boolean {
  return a.title.trim().length >= 2 && Boolean(a.dueOn) && (a.ownerKind === "talent" || Boolean(a.ownerId));
}

/** O que ainda falta para concluir a ata (mesmas regras do banco: meeting_incomplete e invalid_date). */
export function finalizeProblems(
  m: {
    heldAt?: string | null;
    representativeId: string | null;
    notes: Notes;
    followUpOn: string | null;
    actions: readonly Pick<MeetingAction, "title" | "ownerKind" | "ownerId" | "dueOn">[];
    registerIdea: boolean;
  },
  now: number = Date.now(),
): FinalizeProblem[] {
  const out: FinalizeProblem[] = [];
  const held = m.heldAt ? Date.parse(m.heldAt) : Number.NaN;
  if (Number.isFinite(held) && held > now + HELD_AT_SLACK_MS) out.push("heldAt");
  if (!m.representativeId) out.push("representative");
  if ((m.notes.summary ?? "").trim().length < SUMMARY_MIN) out.push("summary");
  if (!m.actions.some(actionReady)) out.push("actions");
  if (!m.followUpOn) out.push("followUp");
  if (m.registerIdea && ((m.notes.project_name ?? "").trim().length < 3 || (m.notes.project_concept ?? "").trim().length < 10)) out.push("project");
  return out;
}

// ------------------------------------------------------------------ dado sensível

/** Dígito verificador do CPF (11 dígitos; sequência repetida não vale). */
export function isCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

/**
 * CPF e dados bancários não entram na ata (mesma regra do banco: sensitive_data): CPF citado pelo nome, 11 dígitos
 * no formato de CPF que fecham o dígito verificador (telefone não fecha), agência e conta com número em qualquer
 * ordem, ou conta corrente/poupança com número. Sem lookbehind (Safari antigo não aceita).
 */
export function hasSensitiveData(text: string | null | undefined): boolean {
  const s = (text ?? "").toLowerCase();
  if (!s) return false;
  if (/cpf\D{0,15}\d{3}/.test(s) || /\d{3}\.\d{3}\.\d{3}-\d{2}/.test(s)) return true;
  for (const m of s.matchAll(/(?:^|\D)(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s/]?\d{2})(?!\d)/g)) {
    if (isCpf(m[1].replace(/\D/g, ""))) return true;
  }
  if (/(ag[eê]ncia|\bag\.?)\s*[:nº°#]*\s*\d{3,5}/.test(s) && /(conta|c\/c|\bcc\b)\D{0,20}\d{4,}/.test(s)) return true;
  return /(conta[ -]corrente|conta[ -]poupan[cç]a|c\/c|\bcc\b)\D{0,6}\d{4,}/.test(s);
}

// ------------------------------------------------------------------ assunto, arquivo e prazos

/** Dia (AAAA-MM-DD) da reunião no fuso de São Paulo. */
export function meetingDay(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: MEETING_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Hora (HH:mm, 24 h) da reunião no fuso de São Paulo. */
export function meetingTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: MEETING_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

/** "AAAA-MM-DD" + "HH:mm" no fuso de São Paulo → instante ISO (com o deslocamento do dia). */
export function meetingInstant(day: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [y, mo, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  const offset = (at: number) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: MEETING_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(at));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
    return (Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - at) / 60_000;
  };
  let off = offset(guess);
  off = offset(guess - off * 60_000);
  return new Date(guess - off * 60_000).toISOString();
}

/** AAAA-MM-DD + n dias (sem fuso: a chave é lida como data pura). */
export function addDays(isoDay: string, n: number): string {
  const [y, m, d] = isoDay.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Nome do arquivo no padrão do guia: "ATA_Creator_Nome_AAAA-MM-DD" (sem acento, espaço vira "_"). */
export function meetingFileName(name: string, isoDay: string): string {
  const slug =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "Hero";
  return `ATA_Creator_${slug}_${isoDay.slice(0, 10)}`;
}

/** Faixa do prazo de um encaminhamento, para a lista de pendências. */
export type DueBucket = "overdue" | "today" | "week" | "later" | "none";
export function dueBucket(dueOn: string | null, today: string): DueBucket {
  if (!dueOn) return "none";
  if (dueOn < today) return "overdue";
  if (dueOn === today) return "today";
  const [y, m, d] = today.split("-").map(Number);
  const week = new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
  return dueOn <= week ? "week" : "later";
}

// ------------------------------------------------------------------ texto da ata (para colar no e-mail ou no grupo)

export type MeetingDocForText = {
  talentName: string;
  heldAt: string;
  mode: MeetingMode;
  representative: string | null;
  participants: string;
  fullName: string;
  contactConfirmed: YesNo | null;
  contactFix: string;
  notes: Notes;
  formats: Formats;
  actionTitle: string | null;
  actionInterest: ActionInterest | null;
  checks: Checks;
  actions: readonly MeetingAction[];
  sender: string | null;
  sentOn: string | null;
  followUpOn: string | null;
};

/** Tradutor do namespace creatorMeetings (getTranslations/useTranslations). */
export type Tr = (key: string, values?: Record<string, string | number>) => string;
export type TextFormat = { date: (isoDay: string) => string; dateTime: (iso: string) => string };

/**
 * Ata em texto puro, na ordem A–K do guia. Linha sem resposta sai com "—", para quem lê saber que a pergunta foi feita
 * e ficou em branco. Rótulos vêm do namespace creatorMeetings (record.*, fields.*, formats.*).
 */
export function meetingText(m: MeetingDocForText, tr: Tr, fmt: TextFormat): string {
  const dash = "—";
  const val = (s: string | null | undefined) => (s && s.trim() ? s.trim() : dash);
  const line = (label: string, value: string | null | undefined) => `• ${label}: ${val(value)}`;
  const note = (k: NoteKey) => line(tr(`fields.${k}`), m.notes[k]);
  const yesNo = (v: YesNo | null | undefined) => (v ? tr(`yesNo.${v}`) : null);
  const box = (on: boolean | undefined, label: string) => `${on ? "☑" : "☐"} ${label}`;
  const out: string[] = [];
  const head = (key: string) => {
    out.push("", tr(`sections.${key}.title`).toUpperCase());
  };

  out.push(tr("record.heading", { name: m.talentName.trim() }));
  head("A");
  out.push(line(tr("fields.talent"), m.talentName));
  out.push(line(tr("fields.full_name"), m.fullName));
  out.push(line(tr("fields.held_at"), fmt.dateTime(m.heldAt)));
  out.push(line(tr("fields.mode"), tr(`modes.${m.mode}`)));
  out.push(line(tr("fields.representative"), m.representative));
  out.push(line(tr("fields.participants"), m.participants));
  out.push(line(tr("fields.contact_confirmed"), [yesNo(m.contactConfirmed), m.contactFix.trim() || null].filter(Boolean).join(" · ")));

  head("B");
  for (const k of SECTION_NOTES.B) out.push(note(k));
  head("C");
  for (const k of SECTION_NOTES.C) out.push(note(k));

  head("D");
  for (const k of FORMAT_KEYS as readonly FormatKey[]) {
    const c = m.formats[k];
    out.push(line(tr(`formats.${k}`), c ? [tr(`interest.${c.interest}`), c.note.trim() || null].filter(Boolean).join(" · ") : null));
  }

  head("E");
  out.push(line(tr("fields.action"), m.actionTitle));
  out.push(line(tr("fields.action_interest"), m.actionInterest ? tr(`actionInterest.${m.actionInterest}`) : null));
  for (const k of SECTION_NOTES.E) out.push(note(k));

  head("F");
  for (const k of SECTION_NOTES.F) out.push(note(k));

  head("G");
  out.push(`• ${REGISTRATION_KEYS.map((k) => box(m.checks[k], tr(`checks.${k}`))).join("  ")}`);
  out.push(line(tr("fields.media_kit"), yesNo(m.checks.media_kit)));
  out.push(line(tr("fields.internal_data"), m.checks.internal_data ? tr(`internalData.${m.checks.internal_data}`) : null));
  out.push(line(tr("fields.channels_insights"), yesNo(m.checks.channels_insights)));
  out.push(note("materials_notes"));

  head("H");
  out.push(val(m.notes.open_questions));

  head("I");
  if (m.actions.length === 0) out.push(dash);
  m.actions.forEach((a, i) => {
    const owner = a.ownerKind === "talent" ? tr("owner.talent") : (a.owner ?? tr("owner.none"));
    const due = a.dueOn ? fmt.date(a.dueOn) : tr("owner.noDue");
    out.push(`${i + 1}. ${a.title.trim()} — ${owner} — ${due} — ${tr(`actionStatus.${a.status}`)}`);
  });

  head("J");
  out.push(val(m.notes.summary));

  head("K");
  for (const k of ["k_reviewed", "k_saved", "k_shared", "k_presidency", "k_follow_up_sent"] as const) out.push(box(m.checks[k], tr(`checks.${k}`)));
  out.push(line(tr("fields.sender"), [m.sender, m.sentOn ? fmt.date(m.sentOn) : null].filter(Boolean).join(" · ")));
  out.push(line(tr("fields.follow_up_on"), m.followUpOn ? fmt.date(m.followUpOn) : null));
  return out.join("\n").trim();
}
