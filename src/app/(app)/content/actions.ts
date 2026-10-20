"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorCode } from "@/lib/supabase/helpers";

// Ações do consumo de conteúdo: conclusão, progresso, favoritos, listas, "não tenho interesse"
// e interesse em produto. Tudo validado com Zod; regras de acesso ficam no banco (RLS/RPC).

export type ActionError = { ok: false; error: string };
export type ActionOk<T extends object = Record<never, never>> = { ok: true } & T;
export type Result<T extends object = Record<never, never>> = ActionOk<T> | ActionError;

export type AchievementInfo = { code: string; name: string };
export type CompletionFeedback = {
  isNew: boolean;
  streak: number;
  achievements: AchievementInfo[];
  programsCompleted: { program_id: string; code: string | null }[];
};

const uuid = z.uuid();
const timezone = z.string().trim().min(1).max(64);
// Caminhos que podem ser revalidados por estas ações (evita revalidação arbitrária).
const pathSchema = z.string().regex(/^\/(content|programs)\/[a-z0-9-]+$/);

function fail(error: unknown): ActionError {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  return { ok: false, error: rpcErrorCode(message) || "generic" };
}

async function requireSession() {
  const user = await getUser();
  if (!user) throw new Error("unauthenticated");
  return user;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") return value as T;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

type CompleteRpc = { new?: boolean; streak?: number; achievements?: string[]; programs_completed?: { program_id?: string; code?: string | null }[] };

// Nomes das conquistas (tabela achievements) para a mensagem; a UI tenta traduzir pelo código.
async function achievementNames(codes: string[]): Promise<AchievementInfo[]> {
  if (codes.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("achievements").select("code, name").in("code", codes);
  const byCode = new Map((data ?? []).map((a) => [a.code, a.name]));
  return codes.map((code) => ({ code, name: byCode.get(code) ?? code }));
}

// ---------------------------------------------------------------- conclusão manual
export async function completeContent(input: { contentId: string; timezone: string; path?: string }): Promise<Result<{ feedback: CompletionFeedback }>> {
  const parsed = z.object({ contentId: uuid, timezone, path: pathSchema.optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    await requireSession();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("complete_content", {
      p_content: parsed.data.contentId,
      p_timezone: parsed.data.timezone,
      p_source: "manual",
    });
    if (error) return fail(error.message);
    const raw = parseJson<CompleteRpc>(data, {});
    const programs = (raw.programs_completed ?? [])
      .filter((p): p is { program_id: string; code?: string | null } => typeof p?.program_id === "string")
      .map((p) => ({ program_id: p.program_id, code: p.code ?? null }));
    const feedback: CompletionFeedback = {
      isNew: Boolean(raw.new),
      streak: Number(raw.streak ?? 0),
      achievements: await achievementNames(Array.isArray(raw.achievements) ? raw.achievements.filter((c): c is string => typeof c === "string") : []),
      programsCompleted: programs,
    };
    if (feedback.isNew) {
      await trackEvent("content.complete", { content_id: parsed.data.contentId, source: "manual" });
      for (const p of programs) await trackEvent("program.complete", { program_id: p.program_id });
    }
    if (parsed.data.path) revalidatePath(parsed.data.path);
    return { ok: true, feedback };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- progresso (player / leitura)
export async function trackProgress(input: {
  contentId: string;
  positionSeconds: number;
  pct: number;
  timezone: string;
  path?: string;
}): Promise<Result<{ completed: boolean; feedback: CompletionFeedback | null }>> {
  const parsed = z
    .object({
      contentId: uuid,
      positionSeconds: z.number().int().min(0).max(60 * 60 * 24),
      pct: z.number().int().min(0).max(100),
      timezone,
      path: pathSchema.optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await requireSession();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("track_progress", {
      p_content: parsed.data.contentId,
      p_position_seconds: parsed.data.positionSeconds,
      p_progress_pct: parsed.data.pct,
      p_timezone: parsed.data.timezone,
    });
    if (error) return fail(error.message);
    const completed = Boolean(parseJson<{ completed?: boolean }>(data, {}).completed);
    if (!completed) return { ok: true, completed: false, feedback: null };

    // track_progress descarta o retorno de complete_content: recupera o que foi concedido agora
    // (conquistas/programas dos últimos segundos) para o feedback do player.
    const since = new Date(Date.now() - 20_000).toISOString();
    const [{ data: completion }, { data: streak }, { data: earned }, { data: programs }] = await Promise.all([
      supabase.from("completions").select("completed_at").eq("user_id", user.id).eq("content_id", parsed.data.contentId).maybeSingle(),
      supabase.rpc("compute_streak", { p_user: user.id, p_timezone: parsed.data.timezone }),
      supabase.from("user_achievements").select("earned_at, achievement:achievements(code, name)").eq("user_id", user.id).gte("earned_at", since),
      supabase.from("enrollments").select("program_id, completed_at").eq("user_id", user.id).eq("status", "completed").gte("completed_at", since),
    ]);
    const isNew = Boolean(completion?.completed_at && new Date(completion.completed_at).toISOString() >= since);
    const feedback: CompletionFeedback = {
      isNew,
      streak: Number(streak ?? 0),
      achievements: (earned ?? [])
        .map((row) => (Array.isArray(row.achievement) ? row.achievement[0] : row.achievement))
        .filter((a): a is { code: string; name: string } => Boolean(a))
        .map((a) => ({ code: a.code, name: a.name })),
      programsCompleted: (programs ?? []).map((p) => ({ program_id: p.program_id, code: null })),
    };
    if (isNew) {
      await trackEvent("content.complete", { content_id: parsed.data.contentId, source: "auto" });
      for (const p of feedback.programsCompleted) await trackEvent("program.complete", { program_id: p.program_id });
      if (parsed.data.path) revalidatePath(parsed.data.path);
    }
    return { ok: true, completed: true, feedback };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- favoritos
export async function toggleFavorite(input: { contentId: string; favorite: boolean; path?: string }): Promise<Result<{ favorite: boolean }>> {
  const parsed = z.object({ contentId: uuid, favorite: z.boolean(), path: pathSchema.optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await requireSession();
    const supabase = await createClient();
    if (parsed.data.favorite) {
      const { error } = await supabase.from("favorites").upsert({ user_id: user.id, content_id: parsed.data.contentId }, { onConflict: "user_id,content_id" });
      if (error) return fail(error.message);
      await trackEvent("favorite.add", { content_id: parsed.data.contentId });
    } else {
      const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("content_id", parsed.data.contentId);
      if (error) return fail(error.message);
      await trackEvent("favorite.remove", { content_id: parsed.data.contentId });
    }
    if (parsed.data.path) revalidatePath(parsed.data.path);
    return { ok: true, favorite: parsed.data.favorite };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- listas pessoais
export type MyList = { id: string; name: string; count: number; contains: boolean };

export async function getMyLists(input: { contentId: string }): Promise<Result<{ lists: MyList[] }>> {
  const parsed = z.object({ contentId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await requireSession();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("custom_lists")
      .select("id, name, items:list_items(content_id)")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) return fail(error.message);
    const lists: MyList[] = (data ?? []).map((l) => {
      const items = (l.items ?? []) as { content_id: string }[];
      return { id: l.id, name: l.name, count: items.length, contains: items.some((i) => i.content_id === parsed.data.contentId) };
    });
    return { ok: true, lists };
  } catch (error) {
    return fail(error);
  }
}

export async function addToList(input: { listId: string; contentId: string }): Promise<Result> {
  const parsed = z.object({ listId: uuid, contentId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    await requireSession();
    const supabase = await createClient();
    const { error } = await supabase
      .from("list_items")
      .upsert({ list_id: parsed.data.listId, content_id: parsed.data.contentId }, { onConflict: "list_id,content_id" });
    if (error) return fail(error.message);
    await supabase.from("custom_lists").update({ updated_at: new Date().toISOString() }).eq("id", parsed.data.listId);
    await trackEvent("list.add", { content_id: parsed.data.contentId, list_id: parsed.data.listId });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function removeFromList(input: { listId: string; contentId: string }): Promise<Result> {
  const parsed = z.object({ listId: uuid, contentId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    await requireSession();
    const supabase = await createClient();
    const { error } = await supabase.from("list_items").delete().eq("list_id", parsed.data.listId).eq("content_id", parsed.data.contentId);
    if (error) return fail(error.message);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function createListAndAdd(input: { name: string; contentId: string }): Promise<Result<{ list: MyList }>> {
  const parsed = z.object({ name: z.string().trim().min(1).max(60), contentId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await requireSession();
    const supabase = await createClient();
    const { data: list, error } = await supabase
      .from("custom_lists")
      .insert({ user_id: user.id, name: parsed.data.name })
      .select("id, name")
      .single();
    if (error || !list) return fail(error?.message ?? "generic");
    const { error: itemError } = await supabase.from("list_items").insert({ list_id: list.id, content_id: parsed.data.contentId });
    if (itemError) return fail(itemError.message);
    await trackEvent("list.add", { content_id: parsed.data.contentId, list_id: list.id, created: true });
    return { ok: true, list: { id: list.id, name: list.name, count: 1, contains: true } };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- não tenho interesse
export async function setNotInterested(input: { contentId: string; value: boolean }): Promise<Result> {
  const parsed = z.object({ contentId: uuid, value: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await requireSession();
    const supabase = await createClient();
    if (parsed.data.value) {
      const { error } = await supabase.from("not_interested").upsert({ user_id: user.id, content_id: parsed.data.contentId }, { onConflict: "user_id,content_id" });
      if (error) return fail(error.message);
      await trackEvent("recommendation.not_interested", { content_id: parsed.data.contentId, source: "content_page" });
    } else {
      const { error } = await supabase.from("not_interested").delete().eq("user_id", user.id).eq("content_id", parsed.data.contentId);
      if (error) return fail(error.message);
    }
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- interesse em produto (vínculo validado)
export async function registerProductInterest(input: { productId: string; contentId: string }): Promise<Result> {
  const parsed = z.object({ productId: uuid, contentId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const user = await getUser();
    if (user) {
      const supabase = await createClient();
      // RLS exige user_id = auth.uid(); visitante só gera o evento anônimo.
      await supabase.from("product_interest").insert({ user_id: user.id, product_id: parsed.data.productId, source: "content_link" });
    }
    await trackEvent("product.interest", { product_id: parsed.data.productId, content_id: parsed.data.contentId, source: "content_link" });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- visualizações (content.view / program.view)
export async function trackView(input: { kind: "content" | "program"; id: string; extra?: Record<string, string | number | boolean | null> }): Promise<void> {
  const parsed = z
    .object({
      kind: z.enum(["content", "program"]),
      id: uuid,
      extra: z.record(z.string().regex(/^[a-z_]{1,32}$/), z.union([z.string().max(80), z.number(), z.boolean(), z.null()])).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return;
  const key = parsed.data.kind === "content" ? "content_id" : "program_id";
  await trackEvent(parsed.data.kind === "content" ? "content.view" : "program.view", { ...(parsed.data.extra ?? {}), [key]: parsed.data.id });
}
