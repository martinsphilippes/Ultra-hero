import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { parsePostBlock, type PostBlock } from "./schema";

// Consultas dos blocos por pilar (0075) e do programa (0076): sempre com o cliente do usuário (RLS
// decide o que aparece).

type Client = SupabaseClient<Database>;

/** Receita, produto ou programa que o conteúdo pode apontar (o que a página mostra, sem campos internos). */
export type RecipeOption = { id: string; title: string; slug: string; cover_url: string | null };
export type ProductOption = { id: string; title: string; slug: string; image_url: string };
export type ProgramOption = { id: string; title: string; slug: string; cover_url: string | null; estimated_weeks: number | null };
export type ComposerOptions = { recipes: RecipeOption[]; products: ProductOption[]; programs: ProgramOption[] };

type ProgramRow = { id: string; slug: string; cover_url: string | null; version: { title: string; estimated_weeks: number | null } | null };

function toProgramOption(row: ProgramRow): ProgramOption {
  return { id: row.id, title: row.version?.title ?? row.slug, slug: row.slug, cover_url: row.cover_url, estimated_weeks: row.version?.estimated_weeks ?? null };
}

/**
 * O que o herói (ou o admin por ele) pode escolher: as receitas publicadas dele, os produtos da loja (os
 * ligados a ele primeiro) e os programas publicados dele. Banco sem a 0075/0076 ou sem cadastro: listas
 * vazias (a tela oferece o cadastro).
 */
export async function loadComposerOptions(supabase: Client, creatorId: string): Promise<ComposerOptions> {
  const [recipesRes, productsRes, linksRes, programsRes] = await Promise.all([
    supabase.from("content").select("id, title, slug, cover_url").eq("creator_id", creatorId).eq("type", "recipe").eq("status", "published").order("published_at", { ascending: false }).limit(50),
    supabase.from("products").select("id, title, slug, image_url").eq("status", "published").order("title").limit(100),
    supabase.from("creator_products").select("product_id, sort_order").eq("creator_id", creatorId).eq("status", "validated"),
    supabase
      .from("programs")
      .select("id, slug, cover_url, version:program_versions!programs_current_version_fk(title, estimated_weeks)")
      .eq("creator_id", creatorId)
      .eq("status", "published")
      .not("current_version_id", "is", null)
      .limit(30),
  ]);
  const recipes = (recipesRes.data ?? []) as RecipeOption[];
  const mine = new Map((linksRes.data ?? []).map((l) => [l.product_id, l.sort_order]));
  const products = ((productsRes.data ?? []) as ProductOption[]).slice().sort((a, b) => {
    const am = mine.has(a.id) ? (mine.get(a.id) ?? 0) : Number.MAX_SAFE_INTEGER;
    const bm = mine.has(b.id) ? (mine.get(b.id) ?? 0) : Number.MAX_SAFE_INTEGER;
    return am === bm ? a.title.localeCompare(b.title) : am - bm;
  });
  const programs = ((programsRes.data ?? []) as unknown as ProgramRow[]).map(toProgramOption).sort((a, b) => a.title.localeCompare(b.title));
  return { recipes, products, programs };
}

/** Blocos do conteúdo que a pessoa pode ver (RLS), já tipados. Sem a 0075: nenhum. */
export async function loadPostBlocks(supabase: Client, contentId: string): Promise<PostBlock[]> {
  const { data, error } = await supabase.from("post_blocks").select("kind, data").eq("content_id", contentId);
  if (error) {
    if (!isMissingSchema(error)) console.warn("[post-blocks] leitura falhou:", error.message);
    return [];
  }
  return (data ?? []).map(parsePostBlock).filter((b): b is PostBlock => b !== null);
}

/** Passos do treino que a pessoa já marcou neste conteúdo. */
export async function loadStepChecks(supabase: Client, contentId: string): Promise<number[]> {
  const { data, error } = await supabase.from("post_step_checks").select("step_index").eq("content_id", contentId);
  if (error) return [];
  return (data ?? []).map((r) => r.step_index);
}

export type BlockReferences = { recipes: Map<string, RecipeOption>; products: Map<string, ProductOption>; programs: Map<string, ProgramOption> };

/** Receitas, produtos e programas citados pelos blocos, para a página mostrar título, capa e link. */
export async function loadBlockReferences(supabase: Client, blocks: PostBlock[]): Promise<BlockReferences> {
  const recipeIds = new Set<string>();
  const productIds = new Set<string>();
  const programIds = new Set<string>();
  for (const block of blocks) {
    if (block.kind === "nutrition") {
      for (const item of block.data.items) {
        if (item.kind === "recipe") recipeIds.add(item.content_id);
        if (item.kind === "product") productIds.add(item.product_id);
      }
    } else if (block.kind === "menu") {
      for (const option of block.data.options) if (option.recipe_id) recipeIds.add(option.recipe_id);
    } else if (block.kind === "program") {
      programIds.add(block.data.program_id);
    }
  }
  const [recipesRes, productsRes, programsRes] = await Promise.all([
    recipeIds.size > 0 ? supabase.from("content").select("id, title, slug, cover_url").in("id", [...recipeIds]).eq("type", "recipe") : null,
    productIds.size > 0 ? supabase.from("products").select("id, title, slug, image_url").in("id", [...productIds]) : null,
    // só programa no ar (a RLS já esconde rascunho de quem não é admin; o admin vê o cartão do seu rascunho)
    programIds.size > 0 ? supabase.from("programs").select("id, slug, cover_url, version:program_versions!programs_current_version_fk(title, estimated_weeks)").in("id", [...programIds]).eq("status", "published") : null,
  ]);
  return {
    recipes: new Map(((recipesRes?.data ?? []) as RecipeOption[]).map((r) => [r.id, r])),
    products: new Map(((productsRes?.data ?? []) as ProductOption[]).map((p) => [p.id, p])),
    programs: new Map(((programsRes?.data ?? []) as unknown as ProgramRow[]).map(toProgramOption).map((p) => [p.id, p])),
  };
}
