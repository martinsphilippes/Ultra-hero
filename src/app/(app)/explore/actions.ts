"use server";

import { revalidatePath } from "next/cache";
import type { ReactNode } from "react";
import { z } from "zod";
import { ACCESS_LEVELS, DIFFICULTIES, MAX_QUERY_LENGTH } from "@/components/discover/explore/params";
import { renderContentCards } from "@/components/discover/explore/renderCards";
import { PAGE_SIZE, searchContentPage } from "@/components/discover/explore/search";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { CONTENT_TYPES, PILLARS, rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Ações do Explorar: paginação da busca, evento de busca e listas pessoais (criar/renomear/excluir/remover item).
// Tudo validado com Zod; a posse das listas é garantida pela RLS (custom_lists / list_items).

export type ActionError = { ok: false; error: string };
export type Result<T extends object = Record<never, never>> = ({ ok: true } & T) | ActionError;

const uuid = z.uuid();
const listName = z.string().trim().min(1, "nameRequired").max(60, "nameTooLong");

function fail(error: unknown): ActionError {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  return { ok: false, error: rpcErrorCode(message) || "failed" };
}

async function requireSession() {
  const user = await getUser();
  if (!user) throw new Error("unauthenticated");
  return user;
}

function revalidateLists(listId?: string) {
  revalidatePath("/explore");
  if (listId) revalidatePath(`/explore/lists/${listId}`);
}

// ---------------------------------------------------------------- busca: carregar mais
const searchSchema = z.object({
  q: z.string().max(MAX_QUERY_LENGTH).catch(""),
  pillar: z.enum(PILLARS).optional(),
  type: z.enum(CONTENT_TYPES).optional(),
  access: z.enum(ACCESS_LEVELS).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  offset: z.number().int().min(0).max(5000),
});

export type LoadMoreInput = z.infer<typeof searchSchema>;

// Devolve os cards já renderizados no servidor (RSC) + cursor para a próxima página.
export async function loadMoreContent(input: LoadMoreInput): Promise<Result<{ nodes: ReactNode; count: number; hasMore: boolean; nextOffset: number }>> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const { offset, ...query } = parsed.data;
    const page = await searchContentPage({ ...query, q: query.q.trim() }, offset);
    return { ok: true, nodes: renderContentCards(page.items), count: page.items.length, hasMore: page.hasMore, nextOffset: page.nextOffset };
  } catch (error) {
    return fail(error);
  }
}

// Evento "search" sem o texto digitado (só o tamanho e os filtros).
export async function trackSearch(input: { qLen: number; pillar?: string | null; type?: string | null }): Promise<void> {
  const parsed = z
    .object({
      qLen: z.number().int().min(0).max(MAX_QUERY_LENGTH),
      pillar: z.enum(PILLARS).nullish(),
      type: z.enum(CONTENT_TYPES).nullish(),
    })
    .safeParse(input);
  if (!parsed.success) return;
  await trackEvent("search", { q_len: parsed.data.qLen, pillar: parsed.data.pillar ?? null, type: parsed.data.type ?? null, page_size: PAGE_SIZE });
}

// ---------------------------------------------------------------- listas pessoais
export async function createList(input: { name: string }): Promise<Result<{ id: string; name: string }>> {
  const parsed = z.object({ name: listName }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  try {
    const user = await requireSession();
    const supabase = await createClient();
    const { data, error } = await supabase.from("custom_lists").insert({ user_id: user.id, name: parsed.data.name }).select("id, name").single();
    if (error || !data) return fail(error?.message);
    revalidateLists();
    return { ok: true, id: data.id, name: data.name };
  } catch (error) {
    return fail(error);
  }
}

export async function renameList(input: { listId: string; name: string }): Promise<Result<{ name: string }>> {
  const parsed = z.object({ listId: uuid, name: listName }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  try {
    await requireSession();
    const supabase = await createClient();
    // RLS limita ao dono; sem linha afetada = lista inexistente ou de outra pessoa.
    const { data, error } = await supabase.from("custom_lists").update({ name: parsed.data.name }).eq("id", parsed.data.listId).select("id, name").maybeSingle();
    if (error) return fail(error.message);
    if (!data) return { ok: false, error: "notFound" };
    revalidateLists(parsed.data.listId);
    return { ok: true, name: data.name };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteList(input: { listId: string }): Promise<Result> {
  const parsed = z.object({ listId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    await requireSession();
    const supabase = await createClient();
    const { data, error } = await supabase.from("custom_lists").delete().eq("id", parsed.data.listId).select("id").maybeSingle();
    if (error) return fail(error.message);
    if (!data) return { ok: false, error: "notFound" };
    revalidateLists(parsed.data.listId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function removeListItem(input: { listId: string; contentId: string }): Promise<Result> {
  const parsed = z.object({ listId: uuid, contentId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    await requireSession();
    const supabase = await createClient();
    const { error } = await supabase.from("list_items").delete().eq("list_id", parsed.data.listId).eq("content_id", parsed.data.contentId);
    if (error) return fail(error.message);
    await supabase.from("custom_lists").update({ updated_at: new Date().toISOString() }).eq("id", parsed.data.listId);
    revalidateLists(parsed.data.listId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
