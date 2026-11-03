import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";
import { failFrom, type ActionFailure } from "./action-utils";
import { uniqueSlug } from "./slug";

// Inserção do rascunho do herói, compartilhada pelo editor (createContent) e pelo composer de
// post (startVideoPost): um só lugar para a regra do slug único e da colisão.

export type CreatorSupabase = Awaited<ReturnType<typeof createClient>>;
type ContentInsert = Database["public"]["Tables"]["content"]["Insert"];

export type InsertedContent = { ok: true; id: string; slug: string };

export async function insertCreatorContent(supabase: CreatorSupabase, row: Omit<ContentInsert, "slug">): Promise<InsertedContent | ActionFailure> {
  // Slug único: em colisão (23505) tenta outro sufixo.
  let lastError: { message?: string; code?: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = uniqueSlug(row.title);
    const { data, error } = await supabase
      .from("content")
      .insert({ ...row, slug })
      .select("id, slug")
      .single();
    if (data) return { ok: true, id: data.id, slug: data.slug };
    lastError = error;
    if (error?.code !== "23505") break;
  }
  return failFrom(lastError);
}
