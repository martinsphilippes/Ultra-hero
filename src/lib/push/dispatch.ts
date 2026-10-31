import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AbstractIntlMessages } from "next-intl";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { collectiblePhase } from "@/lib/collectibles/rules";
import { pushAllowedFor } from "./consent";
import { buildPushMessage, chunk, ticketOutcomes, type ExpoTicket, type PushEvent } from "./message";

// Envio da fila push_outbox (0054) pelo serviço de push da Expo. Chamado logo depois dos eventos
// (publicar post, concluir conteúdo; via after()) e pelo cron diário (agendados, lembretes, sobras).
// Reentrante: push_claim marca o lote, e uma linha só sai com sent_at quando o envio terminou.
// docs/decisions/push-notifications.md.

type Admin = ReturnType<typeof createAdminClient>;
type OutboxRow = { id: number; user_id: string; kind: string; payload: unknown; attempts: number; created_at: string };
// null: não faz mais sentido avisar; defer: ainda não é hora (post reagendado para depois)
type Resolved = PushEvent | null | { defer: string };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
// lote máximo da Expo por requisição
const EXPO_BATCH = 100;
// dentro do orçamento de uma função da Vercel (o cron e o after() têm o mesmo teto)
const EXPO_TIMEOUT_MS = 10_000;
export const CLAIM_LIMIT = 200;
// lembrete de sequência é "hoje": se não saiu em 12 h, já não ajuda
const STREAK_TTL_MS = 12 * 60 * 60 * 1000;

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
async function resolveEvents(admin: Admin, rows: OutboxRow[], locales: Map<string, Locale>): Promise<Map<number, Resolved>> {
  const contentIds = rows.filter((r) => r.kind === "hero_post").map((r) => str(payloadOf(r).content_id)).filter((id): id is string => Boolean(id));
  const programIds = rows.filter((r) => r.kind === "program_completed").map((r) => str(payloadOf(r).program_id)).filter((id): id is string => Boolean(id));
  const codes = rows.filter((r) => r.kind === "achievement").map((r) => str(payloadOf(r).code)).filter((c): c is string => Boolean(c));
  const collectibleIds = rows.filter((r) => r.kind === "auction_outbid").map((r) => str(payloadOf(r).collectible_id)).filter((id): id is string => Boolean(id));
  const noticeIds = rows.filter((r) => r.kind === "office").map((r) => str(payloadOf(r).notification_id)).filter((id): id is string => Boolean(id));

  const [contents, programs, achievements, collectibles] = await Promise.all([
    contentIds.length
      ? admin.from("content").select("id, slug, title, status, publish_at, creator:creator_profiles(name, status)").in("id", contentIds)
      : Promise.resolve({ data: [], error: null }),
    programIds.length ? admin.from("programs").select("id, slug, version:program_versions!programs_current_version_fk(title)").in("id", programIds) : Promise.resolve({ data: [], error: null }),
    codes.length ? admin.from("achievements").select("code, name").in("code", codes) : Promise.resolve({ data: [], error: null }),
    collectibleIds.length
      ? admin.from("collectibles").select("id, title, status, starts_at, ends_at, current_cents, leading_bid_id").in("id", collectibleIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (contents.error) throw new Error(`push: content ${contents.error.message}`);
  if (programs.error) throw new Error(`push: programs ${programs.error.message}`);
  if (achievements.error) throw new Error(`push: achievements ${achievements.error.message}`);
  if (collectibles.error) throw new Error(`push: collectibles ${collectibles.error.message}`);

  // avisos do escritório (0064): o próprio aviso do sino; lido antes do envio = não empurra
  const notices = noticeIds.length
    ? await admin.from("inbox_notifications").select("id, user_id, kind, params, link, read_at").in("id", noticeIds)
    : { data: [], error: null };
  if (notices.error) throw new Error(`push: inbox ${notices.error.message}`);
  const noticeById = new Map((notices.data ?? []).map((n) => [n.id, n]));

  // lance superado (0061): quem vence agora (para não avisar quem já voltou à frente)
  type CollectibleRow = { id: string; title: string; status: string; starts_at: string | null; ends_at: string | null; current_cents: number; leading_bid_id: string | null };
  const collectibleById = new Map((collectibles.data as CollectibleRow[] | null ?? []).map((c) => [c.id, c]));
  const leadingIds = [...collectibleById.values()].map((c) => c.leading_bid_id).filter((id): id is string => Boolean(id));
  const leaders = leadingIds.length ? await admin.from("collectible_bid_owners").select("bid_id, user_id").in("bid_id", leadingIds) : { data: [], error: null };
  if (leaders.error) throw new Error(`push: bid owners ${leaders.error.message}`);
  const leaderByBid = new Map((leaders.data ?? []).map((o) => [o.bid_id, o.user_id]));

  type ContentRow = { id: string; slug: string; title: string | null; status: string; publish_at: string | null; creator: { name: string; status: string } | { name: string; status: string }[] | null };
  type ProgramRow = { id: string; slug: string; version: { title: string } | { title: string }[] | null };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const contentById = new Map((contents.data as ContentRow[] | null ?? []).map((c) => [c.id, c]));
  const programById = new Map((programs.data as ProgramRow[] | null ?? []).map((p) => [p.id, p]));
  const achievementName = new Map((achievements.data ?? []).map((a) => [a.code, a.name]));

  const out = new Map<number, Resolved>();
  for (const row of rows) {
    const p = payloadOf(row);
    if (row.kind === "hero_post") {
      const c = contentById.get(str(p.content_id) ?? "");
      const creator = one(c?.creator ?? null);
      // saiu do ar, voltou a rascunho ou o herói foi suspenso antes do envio: não avisa;
      // reagendado para depois (o gatilho não vê a troca de data de quem já está publicado): espera
      const published = c && c.status === "published" && creator?.status === "active";
      if (published && c.publish_at && new Date(c.publish_at) > new Date()) out.set(row.id, { defer: c.publish_at });
      else out.set(row.id, published ? { kind: "hero_post", hero: creator!.name, contentTitle: c!.title, contentSlug: c!.slug } : null);
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
      const fresh = Date.now() - new Date(row.created_at).getTime() < STREAK_TTL_MS;
      out.set(row.id, streak && streak > 0 && fresh ? { kind: "streak_reminder", streak } : null);
    } else if (row.kind === "auction_outbid") {
      // item que saiu do ar ou acabou, ou a pessoa já voltou à frente: o aviso perdeu o sentido
      const item = collectibleById.get(str(p.collectible_id) ?? "");
      const live = item && collectiblePhase(item.status, item.starts_at, item.ends_at, Date.now()) === "live";
      const leadingAgain = item?.leading_bid_id ? leaderByBid.get(item.leading_bid_id) === row.user_id : false;
      out.set(row.id, item && live && !leadingAgain ? { kind: "auction_outbid", item: item.title, amountCents: item.current_cents, collectibleId: item.id } : null);
    } else if (row.kind === "office") {
      const notice = noticeById.get(str(p.notification_id) ?? "");
      const params = notice?.params && typeof notice.params === "object" && !Array.isArray(notice.params) ? (notice.params as Record<string, unknown>) : {};
      const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => typeof v === "string" || typeof v === "number").map(([k, v]) => [k, String(v).slice(0, 120)]));
      out.set(
        row.id,
        notice && !notice.read_at && notice.user_id === row.user_id && notice.link.startsWith("/creator/escritorio")
          ? { kind: "office", inboxKind: notice.kind, params: clean, link: notice.link }
          : null,
      );
    } else out.set(row.id, null);
  }
  return out;
}

// Nome da conquista no idioma da pessoa (consume.json → achievements), senão o do banco.
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
    // "*": num banco sem a 0061 a coluna auction_outbid não existe (conta como desligada)
    admin.from("notification_preferences").select("*").in("user_id", userIds),
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
  const allowed = (row: OutboxRow) => pushAllowedFor(prefs.get(row.user_id), row.kind);

  const skipped: { id: number; outcome: string }[] = [];
  const deferred: { id: number; notBefore: string }[] = [];
  const outgoing: { rowId: number; token: string; message: { to: string; title: string; body: string; data: Record<string, string>; sound: "default"; channelId: string } }[] = [];
  for (const row of rows) {
    const event = events.get(row.id);
    const tokens = tokensByUser.get(row.user_id) ?? [];
    if (!allowed(row)) skipped.push({ id: row.id, outcome: "skipped_consent" });
    else if (event && "defer" in event) deferred.push({ id: row.id, notBefore: event.defer });
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

  // gravação que falha não some em silêncio: a linha volta à fila em 5 min (um aviso pode repetir)
  const mark = async (ids: number[], values: Database["public"]["Tables"]["push_outbox"]["Update"]) => {
    if (ids.length === 0) return;
    const { error: markError } = await admin.from("push_outbox").update(values).in("id", ids);
    if (markError) console.error("[push] marcar fila falhou", JSON.stringify({ rows: ids.length, outcome: values.outcome ?? null, error: markError.message }));
  };

  const now = new Date().toISOString();
  for (const outcome of new Set(skipped.map((s) => s.outcome))) {
    await mark(skipped.filter((s) => s.outcome === outcome).map((s) => s.id), { sent_at: now, outcome });
  }
  result.skipped = skipped.length;
  // reagendado: volta à fila para a data nova, sem gastar tentativa
  for (const d of deferred) await mark([d.id], { not_before: d.notBefore, claimed_at: null, attempts: 0 });

  // linha conta como enviada se ao menos um aparelho da pessoa recebeu; aparelho que saiu some
  const delivered = new Set<number>();
  const errors = new Map<number, string>();
  const gone: string[] = [];
  for (const batch of chunk(outgoing, EXPO_BATCH)) {
    try {
      const outcomes = ticketOutcomes(batch.length, await sendToExpo(batch.map((b) => b.message)));
      outcomes.forEach((outcome, index) => {
        const item = batch[index];
        if (outcome.status === "ok") delivered.add(item.rowId);
        else if (outcome.status === "gone") gone.push(item.token);
        else errors.set(item.rowId, outcome.error);
      });
    } catch (err) {
      // erro de rede ou HTTP: o lote volta à fila (até 5 tentativas)
      for (const b of batch) errors.set(b.rowId, err instanceof Error ? err.message : String(err));
    }
  }
  if (gone.length) {
    const { error: goneError } = await admin.from("push_tokens").delete().in("token", [...new Set(gone)]);
    if (goneError) console.error("[push] apagar tokens falhou", goneError.message);
    result.removed_tokens = new Set(gone).size;
  }

  await mark([...delivered], { sent_at: now, outcome: "sent", last_error: null });
  result.sent = delivered.size;
  const outgoingIds = new Set(outgoing.map((o) => o.rowId));
  for (const id of outgoingIds) {
    if (delivered.has(id)) continue;
    const message = errors.get(id);
    if (message === undefined) {
      // todos os aparelhos saíram: não há para onde tentar de novo
      await mark([id], { sent_at: now, outcome: "skipped_no_device", last_error: "device_not_registered" });
      result.skipped += 1;
    } else {
      await mark([id], { last_error: message, claimed_at: null });
      result.failed += 1;
    }
  }

  // evento estruturado: contagens só, nada de token nem de pessoa
  console.log("[push] dispatch", JSON.stringify(result));
  return result;
}

/**
 * Esvazia a fila em lotes até acabar o que está vencido ou o tempo do cron (um herói com muitos
 * seguidores enche a fila de uma vez; um lote só deixaria o resto para o dia seguinte).
 */
export async function drainPushOutbox(admin: Admin, budgetMs = 45_000): Promise<DispatchResult & { rounds: number }> {
  const started = Date.now();
  const total = { claimed: 0, sent: 0, skipped: 0, failed: 0, removed_tokens: 0, rounds: 0 };
  for (;;) {
    const round = await dispatchPushOutbox(admin);
    total.rounds += 1;
    total.claimed += round.claimed;
    total.sent += round.sent;
    total.skipped += round.skipped;
    total.failed += round.failed;
    total.removed_tokens += round.removed_tokens;
    if (round.claimed < CLAIM_LIMIT || Date.now() - started > budgetMs) return total;
  }
}
