"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { RECIPE_UNITS, type RecipeUnit } from "@/lib/recipes/codes";
import { isMissingRelation } from "@/lib/recipes/history";
import { SERVINGS_MAX, SERVINGS_MIN, servingsFactor } from "@/lib/recipes/scale";
import { buildShoppingRows, parseEditedAmount, planShoppingUpsert, SHOPPING_LIST_PATH, shoppingUpdatePatch, type ShoppingIngredient, type ShoppingRow } from "@/lib/recipes/shopping";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Lista de compras pessoal (fase 5). Tudo com o cliente da pessoa: a RLS da 0027 só deixa ler e
// mexer nas próprias linhas (nem o admin lê), o gatilho preenche product_id a partir do vínculo
// validado e recusa o 301º item. O acesso à receita é conferido no banco (can_access_content, que
// inclui a etapa demonstrativa), e as quantidades são recalculadas aqui a partir das tabelas: o
// navegador manda só quais ingredientes e quantas porções.

export type ShoppingResult<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };

type DbError = { code?: string | null; message?: string | null } | null | undefined;

function fail(error: DbError): { ok: false; error: string } {
  if (isMissingRelation(error)) return { ok: false, error: "shopping_unavailable" };
  const code = rpcErrorCode(error?.message);
  if (code === "shopping_list_full") return { ok: false, error: code };
  if (error?.code === "42501" || /permission denied|row-level security/i.test(error?.message ?? "")) return { ok: false, error: "forbidden" };
  return { ok: false, error: "generic" };
}

const addSchema = z.object({
  contentId: z.uuid(),
  ingredientIds: z.array(z.uuid()).min(1).max(60),
  servings: z.number().int().min(SERVINGS_MIN).max(SERVINGS_MAX).nullable().optional(),
});

type IngredientDbRow = { id: string; position: number; name: string; quantity: number | null; unit: string | null; quantity_text: string | null; to_taste: boolean };

const asUnit = (u: string | null): RecipeUnit | null => ((RECIPE_UNITS as readonly string[]).includes(u ?? "") ? (u as RecipeUnit) : null);

/**
 * "Adicionar à lista de compras" na página da receita. Insere o que ainda não está na lista e
 * atualiza o que já está (mesmo ingrediente): sem upsert do PostgREST, porque o "do update" tocaria
 * colunas fora do grant de update (content_id, ingredient_id) — mesma saída da fase 4 no histórico.
 */
export async function addRecipeToShoppingList(input: { contentId: string; ingredientIds: string[]; servings?: number | null }): Promise<ShoppingResult<{ added: number; updated: number }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const { contentId, servings } = parsed.data;
  const ids = [...new Set(parsed.data.ingredientIds)];
  const supabase = await createClient();

  // a mesma regra do RecipeGate, avaliada no banco: plano/módulo, receita no ar e a etapa feita
  const access = await supabase.rpc("can_access_content", { p_content: contentId });
  if (access.error) return fail(access.error);
  if (access.data !== true) return { ok: false, error: "forbidden" };

  const [detailsRes, ingredientsRes] = await Promise.all([
    supabase.from("recipe_details").select("servings").eq("content_id", contentId).maybeSingle(),
    supabase.from("recipe_ingredients").select("id, position, name, quantity, unit, quantity_text, to_taste").eq("content_id", contentId).in("id", ids),
  ]);
  if (ingredientsRes.error) return fail(ingredientsRes.error);
  const found = (ingredientsRes.data ?? []) as IngredientDbRow[];
  // id de outra receita (ou inventado) não entra: a lista só aceita os ingredientes desta receita
  if (found.length !== ids.length) return { ok: false, error: "invalid_input" };

  const ingredients: ShoppingIngredient[] = found.map((i) => ({
    id: i.id,
    position: i.position,
    name: i.name,
    quantity: i.quantity === null ? null : Number(i.quantity),
    unit: asUnit(i.unit),
    quantityText: i.quantity_text,
    toTaste: i.to_taste,
  }));
  const factor = servingsFactor(detailsRes.data?.servings ?? null, servings ?? null);
  const rows = buildShoppingRows(ingredients, ids, factor);

  const existingRes = await supabase.from("shopping_list_items").select("ingredient_id").eq("user_id", user.id).in("ingredient_id", ids);
  if (existingRes.error) return fail(existingRes.error);
  const plan = planShoppingUpsert(existingRes.data ?? [], rows);

  let added = 0;
  let updated = 0;
  const update = async (row: ShoppingRow) => {
    const { error } = await supabase.from("shopping_list_items").update(shoppingUpdatePatch(row)).eq("user_id", user.id).eq("ingredient_id", row.ingredient_id);
    return error;
  };

  if (plan.inserts.length > 0) {
    // user_id e product_id ficam com o banco (default auth.uid() e o gatilho); não estão no grant
    const { error } = await supabase.from("shopping_list_items").insert(plan.inserts.map((r) => ({ content_id: contentId, ...r })));
    if (!error) added += plan.inserts.length;
    else if (error.code === "23505") {
      // corrida com outra aba: o item entrou no meio do caminho, então vira atualização
      for (const row of plan.inserts) {
        const single = await supabase.from("shopping_list_items").insert({ content_id: contentId, ...row });
        if (!single.error) added += 1;
        else if (single.error.code === "23505") {
          const err = await update(row);
          if (err) return fail(err);
          updated += 1;
        } else return fail(single.error);
      }
    } else return fail(error);
  }
  for (const { ingredientId } of plan.updates) {
    const row = rows.find((r) => r.ingredient_id === ingredientId)!;
    const err = await update(row);
    if (err) return fail(err);
    updated += 1;
  }

  revalidatePath(SHOPPING_LIST_PATH);
  await trackEvent("recipe.shopping_add", { items: rows.length });
  return { ok: true, added, updated };
}

const idSchema = z.object({ id: z.uuid() });

/** Marcar comprado (a tela já mudou; aqui só confirma). */
export async function setShoppingItemChecked(input: { id: string; checked: boolean }): Promise<ShoppingResult> {
  const parsed = z.object({ id: z.uuid(), checked: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("shopping_list_items").update({ checked: parsed.data.checked }).eq("id", parsed.data.id).eq("user_id", user.id).select("id");
  if (error) return fail(error);
  if (!data || data.length === 0) return { ok: false, error: "not_found" };
  // sem revalidatePath: a tela já mudou (otimista) e recarregar a lista a cada toque pesaria no celular
  return { ok: true };
}

/** Editar a quantidade: número (com a unidade do item ou a digitada) ou texto; sem conversão. */
export async function updateShoppingItemAmount(input: { id: string; amount: string }): Promise<ShoppingResult> {
  const parsed = z.object({ id: z.uuid(), amount: z.string().max(80) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const supabase = await createClient();
  const current = await supabase.from("shopping_list_items").select("unit").eq("id", parsed.data.id).eq("user_id", user.id).maybeSingle();
  if (current.error) return fail(current.error);
  if (!current.data) return { ok: false, error: "not_found" };
  const amount = parseEditedAmount(parsed.data.amount, asUnit(current.data.unit));
  if (!amount) return { ok: false, error: "invalid_amount" };
  const { error } = await supabase.from("shopping_list_items").update(amount).eq("id", parsed.data.id).eq("user_id", user.id);
  if (error) return fail(error);
  revalidatePath(SHOPPING_LIST_PATH);
  return { ok: true };
}

export async function removeShoppingItem(input: { id: string }): Promise<ShoppingResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const supabase = await createClient();
  const { error } = await supabase.from("shopping_list_items").delete().eq("id", parsed.data.id).eq("user_id", user.id);
  if (error) return fail(error);
  revalidatePath(SHOPPING_LIST_PATH);
  return { ok: true };
}

/** "Limpar comprados": apaga só os marcados. */
export async function clearCheckedShoppingItems(): Promise<ShoppingResult<{ removed: number }>> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("shopping_list_items").delete().eq("user_id", user.id).eq("checked", true).select("id");
  if (error) return fail(error);
  revalidatePath(SHOPPING_LIST_PATH);
  return { ok: true, removed: data?.length ?? 0 };
}

/** "Limpar lista": apaga tudo, só com a confirmação explícita (não há desfazer). */
export async function clearShoppingList(input: { confirm: boolean }): Promise<ShoppingResult<{ removed: number }>> {
  const parsed = z.object({ confirm: z.literal(true) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "confirmation_required" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("shopping_list_items").delete().eq("user_id", user.id).select("id");
  if (error) return fail(error);
  revalidatePath(SHOPPING_LIST_PATH);
  return { ok: true, removed: data?.length ?? 0 };
}
