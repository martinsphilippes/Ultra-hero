"use server";

import { revalidatePath } from "next/cache";
import type { ReactNode } from "react";
import { z } from "zod";
import { ACCESS_LEVELS, DIFFICULTIES, MAX_QUERY_LENGTH } from "@/components/discover/explore/params";
import { exploreFeedPage } from "@/components/discover/explore/feed";
import { renderContentTiles } from "@/components/discover/explore/renderTiles";
import { MAX_OFFSET, TILE_PAGE_SIZE } from "@/components/discover/explore/tiles";
import { renderRecipeCards } from "@/components/recipes/catalog/renderRecipeCards";
import { renderShowcaseRecipeCards } from "@/components/recipes/showcase/showcase-cards";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { CONTENT_TYPES, PILLARS, rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { listTargetSchema, targetColumn, type ListTarget } from "@/lib/library/list-items";
import { fetchRecipeCatalog } from "@/lib/recipes/catalog";
import { catalogFilterNames, recipeCatalogParamsSchema } from "@/lib/recipes/catalog-params";

// Ações do Explorar: paginação da grade, evento de busca e listas pessoais (criar/renomear/excluir/remover item;
// o item pode ser conteúdo, produto ou programa).
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

// ---------------------------------------------------------------- grade: carregar mais
const tilesSchema = z.object({
  q: z.string().max(MAX_QUERY_LENGTH).catch(""),
  pillar: z.enum(PILLARS).optional(),
  type: z.enum(CONTENT_TYPES).optional(),
  access: z.enum(ACCESS_LEVELS).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  // A semente vem do cliente para a página seguinte continuar a MESMA ordem da primeira (virada de dia no meio da rolagem não repete nem pula).
  seed: z.number().int().min(0).max(2_147_483_647),
  offset: z.number().int().min(0).max(MAX_OFFSET),
});

export type LoadMoreTilesInput = z.infer<typeof tilesSchema>;

// Devolve os quadros já renderizados no servidor (RSC) + cursor para a próxima página.
export async function loadMoreTiles(input: LoadMoreTilesInput): Promise<Result<{ nodes: ReactNode; count: number; hasMore: boolean; nextOffset: number }>> {
  const parsed = tilesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const { offset, seed, ...query } = parsed.data;
    const page = await exploreFeedPage({ ...query, q: query.q.trim() }, seed, offset);
    return { ok: true, nodes: renderContentTiles(page.items), count: page.items.length, hasMore: page.hasMore, nextOffset: page.nextOffset };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- catálogo de receitas: carregar mais
const recipesSchema = z.object({
  params: recipeCatalogParamsSchema,
  creator: z.uuid().nullable(),
  // cursor de recipe_catalog: "rn" (relevância) ou "chave|uuid"; a função recusa o malformado
  cursor: z.string().min(1).max(120),
  // Alimentação do herói (0051): cards com as ações da vitrine do herói `creator`
  showcase: z.boolean().optional(),
});

export type LoadMoreRecipesInput = z.input<typeof recipesSchema>;

// Próxima página do catálogo (aba Receitas ou biblioteca do chef), com os cards já renderizados.
export async function loadMoreRecipes(input: LoadMoreRecipesInput): Promise<Result<{ nodes: ReactNode; count: number; nextCursor: string | null }>> {
  const parsed = recipesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const supabase = await createClient();
    const page = await fetchRecipeCatalog(supabase, parsed.data.params, { creator: parsed.data.creator, cursor: parsed.data.cursor });
    if (parsed.data.showcase && parsed.data.creator) {
      const { data: hero } = await supabase.from("creator_profiles").select("id, slug, name, avatar_url, is_fictional").eq("id", parsed.data.creator).maybeSingle();
      if (hero) return { ok: true, nodes: await renderShowcaseRecipeCards(page.items, hero), count: page.items.length, nextCursor: page.nextCursor };
    }
    return { ok: true, nodes: renderRecipeCards(page.items), count: page.items.length, nextCursor: page.nextCursor };
  } catch (error) {
    return fail(error);
  }
}

// Evento recipe.catalog_filter: só os NOMES dos filtros usados, nunca os valores (dieta e alergia
// são dado de saúde) nem o texto buscado.
export async function trackRecipeCatalogFilter(input: { params: z.input<typeof recipeCatalogParamsSchema>; scope: "explore" | "chef" }): Promise<void> {
  const parsed = z.object({ params: recipeCatalogParamsSchema, scope: z.enum(["explore", "chef"]) }).safeParse(input);
  if (!parsed.success) return;
  const names = catalogFilterNames(parsed.data.params);
  if (names.length === 0) return;
  await trackEvent("recipe.catalog_filter", { filters: names.join(","), scope: parsed.data.scope });
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
  await trackEvent("search", { q_len: parsed.data.qLen, pillar: parsed.data.pillar ?? null, type: parsed.data.type ?? null, page_size: TILE_PAGE_SIZE });
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

// Remove um item (conteúdo, produto ou programa) da lista. Sem a 0040 no banco só existe conteúdo.
export async function removeListItem(input: { listId: string; target: ListTarget }): Promise<Result> {
  const parsed = z.object({ listId: uuid, target: listTargetSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { listId, target } = parsed.data;
  try {
    await requireSession();
    const supabase = await createClient();
    const { error } = await supabase.from("list_items").delete().eq("list_id", listId).eq(targetColumn(target.kind), target.id);
    if (error) return fail(error.message);
    await supabase.from("custom_lists").update({ updated_at: new Date().toISOString() }).eq("id", listId);
    revalidateLists(listId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
