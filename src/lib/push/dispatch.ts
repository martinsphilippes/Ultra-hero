import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AbstractIntlMessages } from "next-intl";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import type { createAdminClient } from "@/lib/supabase/admin";
import { buildPushMessage, chunk, interpretTickets, type ExpoTicket, type PushEvent, type PushKind } from "./message";

// Envio da fila push_outbox (0050) pelo serviço de push da Expo. Chamado logo depois dos eventos
// (publicar post, concluir conteúdo; via after()) e pelo cron diário (agendados, lembretes, sobras).
// Reentrante: push_claim marca o lote, e uma linha só sai com sent_at quando o envio terminou.
// docs/decisions/push-notifications.md.

type Admin = ReturnType<typeof createAdminClient>;
type OutboxRow = { id: number; user_id: string; kind: string; payload: unknown; attempts: number };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
// lote máximo da Expo por requisição
const EXPO_BATCH = 100;
// dentro do orçamento de uma função da Vercel (o cron e o after() têm o mesmo teto)
const EXPO_TIMEOUT_MS = 10_000;
const CLAIM_LIMIT = 200;

export type DispatchResult = { claimed: number; sent: number; skipped: number; failed: number; removed_tokens: number };

const messagesCache = new Map<Locale, Promise<AbstractIntlMessages>>();
function pushMessages(locale: Locale): Promise<AbstractIntlMessages> {
  let pending = messagesCache.get(locale);
  if (!pending) {
    pending = fs.readFile(path.join(process.cwd(), "messages", locale, "push.json"), "utf8").then((raw) => JSON.parse(raw) as AbstractIntlMessages);
    messagesCache.set(locale, pending);
  }
  return pending;
}

const str = (value: unknown) => (typeof value === "string" ? value : null);
const payloadOf = (row: OutboxRow) => (row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {});

/** Monta o evento de cada linha a partir do banco; null quando não faz mais sentido avisar. */
async function resolveEvents(admin: Admin, rows: OutboxRow[], locales: Map<string, Locale>): Promise<Map<number, PushEvent | null>> {
  const contentIds = rows.filter((r) => r.kind === "hero_post").map((r) => str(payloadOf(r).content_id)).filter((id): id is string => Boolean(id));
  const programIds = rows.filter((r) => r.kind === "program_completed").map((r) => str(payloadOf(r).program_id)).filter((id): id is string => Boolean(id));
  const codes = rows.filter((r) => r.kind === "achievement").map((r) => str(payloadOf(r).code)).filter((c): c is string => Boolean(c));

  const [contents, programs, achievements] = await Promise.all([
    contentIds.length
      ? admin.from("content").select("id, slug, title, status, publish_at, creator:creator_profiles(name, status)").in("id", contentIds)
      : Promise.resolve({ data: [], error: null }),
    programIds.length ? admin.from("programs").select("id, slug, version:program_versions!programs_current_version_fk(title)").in("id", programIds) : Promise.resolve({ data: [], error: null }),
    codes.length ? admin.from("achievements").select("code, name").in("code", codes) : Promise.resolve({ data: [], error: null }),
  ]);
  if (contents.error) throw new Error(`push: content ${contents.error.message}`);
  if (programs.error) throw new Error(`push: programs ${programs.error.message}`);
  if (achievements.error) throw new Error(`push: achievements ${achievements.error.message}`);

  type ContentRow = { id: string; slug: string; title: string | null; status: string; publish_at: string | null; creator: { name: string; status: string } | { name: string; status: string }[] | null };
  type ProgramRow = { id: string; slug: string; version: { title: string } | { title: string }[] | null };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const contentById = new Map((contents.data as ContentRow[] | null ?? []).map((c) => [c.id, c]));
  const programById = new Map((programs.data as ProgramRow[] | null ?? []).map((p) => [p.id, p]));
  const achievementName = new Map((achievements.data ?? []).map((a) => [a.code, a.name]));

  const out = new Map<number, PushEvent | null>();
  for (const row of rows) {
    const p = payloadOf(row);
    if (row.kind === "hero_post") {
      const c = contentById.get(str(p.content_id) ?? "");
      const creator = one(c?.creator ?? null);
      // saiu do ar, voltou a rascunho ou o herói foi suspenso antes do envio: não avisa
      const live = c && c.status === "published" && (!c.publish_at || new Date(c.publish_at) <= new Date()) && creator?.status === "active";
      out.set(row.id, live ? { kind: "hero_post", hero: creator!.name, contentTitle: c!.title, contentSlug: c!.slug } : null);
    } else if (row.kind === "achievement") {
      const code = str(p.code);
      const name = code ? await achievementLabel(code, locales.get(row.user_id) ?? defaultLocale, achievementName.get(code)) : null;
      out.set(row.id, name ? { kind: "achievement", name } : null);
    } else if (row.kind === "program_completed") {
      const program = programById.get(str(p.program_id) ?? "");
      const title = one(program?.version ?? null)?.title;
      out.set(row.id, program && title ? { kind: "program_completed", program: title, programSlug: program.slug } : null);
    } else if (row.kind === "streak_reminder") {
      const streak = typeof p.streak === "number" ? p.streak : null;
      out.set(row.id, streak && streak > 0 ? { kind: "streak_reminder", streak } : null);
    } else out.set(row.id, null);
  }
  return out;
}

// Nome da conquista no idioma da pessoa (me.json → evolution.achievements.names), senão o do banco.
const achievementNames = new Map<Locale, Promise<Record<string, string>>>();
async function achievementLabel(code: string, locale: Locale, fallback: string | undefined): Promise<string | null> {
  let pending = achievementNames.get(locale);
  if (!pending) {
    pending = fs
      .readFile(path.join(process.cwd(), "messages", locale, "consume.json"), "utf8")
      .then((raw) => (JSON.parse(raw) as { achievements?: Record<string, string> }).achievements ?? {})
      .catch(() => ({}));
    achievementNames.set(locale, pending);
  }
  return (await pending)[code] ?? fallback ?? null;
}

async function sendToExpo(messages: { to: string; title: string; body: string; data: Record<string, string>; sound: "default"; channelId: string }[]) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  // Segurança reforçada da Expo: com ela ligada, só quem tem este token envia para os aparelhos
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  const response = await fetch(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(messages), signal: AbortSignal.timeout(EXPO_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`expo_http_${response.status}`);
  const body = (await response.json()) as { data?: ExpoTicket[] };
  return body.data ?? [];
}

export async function dispatchPushOutbox(admin: Admin): Promise<DispatchResult> {
  const result: DispatchResult = { claimed: 0, sent: 0, skipped: 0, failed: 0, removed_tokens: 0 };
  const { data: claimed, error } = await admin.rpc("push_claim", { p_limit: CLAIM_LIMIT });
  if (error) throw new Error(`push: claim ${error.message}`);
  const rows = (claimed ?? []) as OutboxRow[];
  result.claimed = rows.length;
  if (rows.length === 0) return result;

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const [tokensRes, prefsRes, profilesRes] = await Promise.all([
    admin.from("push_tokens").select("token, user_id").in("user_id", userIds),
    admin.from("notification_preferences").select("user_id, channel_push, hero_posts, achievements, streak_reminders").in("user_id", userIds),
    admin.from("profiles").select("id, locale").in("id", userIds),
  ]);
  if (tokensRes.error) throw new Error(`push: tokens ${tokensRes.error.message}`);
  if (prefsRes.error) throw new Error(`push: prefs ${prefsRes.error.message}`);
  if (profilesRes.error) throw new Error(`push: profiles ${profilesRes.error.message}`);

  const tokensByUser = new Map<string, string[]>();
  for (const t of tokensRes.data ?? []) tokensByUser.set(t.user_id, [...(tokensByUser.get(t.user_id) ?? []), t.token]);
  const prefs = new Map((prefsRes.data ?? []).map((p) => [p.user_id, p]));
  const locales = new Map((profilesRes.data ?? []).map((p) => [p.id, isLocale(p.locale) ? p.locale : defaultLocale]));
  const events = await resolveEvents(admin, rows, locales);

  // o consentimento pode ter mudado entre a fila e o envio
  const allowed = (row: OutboxRow) => {
    const p = prefs.get(row.user_id);
    if (!p?.channel_push) return false;
    const kind = row.kind as PushKind;
    return kind === "hero_post" ? p.hero_posts : kind === "streak_reminder" ? p.streak_reminders : p.achievements;
  };

  const skipped: { id: number; outcome: string }[] = [];
  const outgoing: { rowId: number; token: string; message: { to: string; title: string; body: string; data: Record<string, string>; sound: "default"; channelId: string } }[] = [];
  for (const row of rows) {
    const event = events.get(row.id);
    const tokens = tokensByUser.get(row.user_id) ?? [];
    if (!allowed(row)) skipped.push({ id: row.id, outcome: "skipped_consent" });
    else if (!event) skipped.push({ id: row.id, outcome: "skipped_stale" });
    else if (tokens.length === 0) skipped.push({ id: row.id, outcome: "skipped_no_device" });
    else {
      const locale = locales.get(row.user_id) ?? defaultLocale;
      const message = buildPushMessage(event, locale, await pushMessages(locale));
      for (const token of tokens) {
        outgoing.push({ rowId: row.id, token, message: { to: token, title: message.title, body: message.body, data: { url: message.url, kind: row.kind }, sound: "default", channelId: "default" } });
      }
    }
  }

  const now = new Date().toISOString();
  for (const s of skipped) {
    await admin.from("push_outbox").update({ sent_at: now, outcome: s.outcome }).eq("id", s.id);
  }
  result.skipped = skipped.length;

  // linha conta como enviada se ao menos um aparelho da pessoa recebeu; aparelho que saiu some
  const delivered = new Set<number>();
  const errors = new Map<number, string>();
  const gone: string[] = [];
  for (const batch of chunk(outgoing, EXPO_BATCH)) {
    try {
      const tickets = await sendToExpo(batch.map((b) => b.message));
      const verdict = interpretTickets(batch.map((b) => b.token), tickets);
      const okTokens = new Set(verdict.ok);
      for (const b of batch) if (okTokens.has(b.token)) delivered.add(b.rowId);
      for (const f of verdict.failed) {
        const b = batch.find((x) => x.token === f.token);
        if (b) errors.set(b.rowId, f.error);
      }
      gone.push(...verdict.gone);
    } catch (err) {
      // erro de rede ou HTTP: o lote volta à fila (claimed_at vence em 5 min; até 5 tentativas)
      for (const b of batch) errors.set(b.rowId, err instanceof Error ? err.message : String(err));
    }
  }
  if (gone.length) {
    await admin.from("push_tokens").delete().in("token", gone);
    result.removed_tokens = gone.length;
  }

  const sentIds = [...delivered];
  if (sentIds.length) await admin.from("push_outbox").update({ sent_at: now, outcome: "sent", last_error: null }).in("id", sentIds);
  result.sent = sentIds.length;
  const outgoingIds = new Set(outgoing.map((o) => o.rowId));
  for (const id of outgoingIds) {
    if (delivered.has(id)) continue;
    const message = errors.get(id) ?? "device_not_registered";
    // todos os aparelhos saíram: não há para onde tentar de novo
    const final = message === "device_not_registered";
    await admin.from("push_outbox").update(final ? { sent_at: now, outcome: "skipped_no_device", last_error: message } : { last_error: message, claimed_at: null }).eq("id", id);
    if (!final) result.failed += 1;
    else result.skipped += 1;
  }

  // evento estruturado: contagens só, nada de token nem de pessoa
  console.log("[push] dispatch", JSON.stringify(result));
  return result;
}
