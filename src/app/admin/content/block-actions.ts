"use server";

import { z } from "zod";
import { getUser, hasRole } from "@/lib/auth/session";
import { loadComposerOptions, type ComposerOptions } from "@/lib/post-blocks/queries";
import { createClient } from "@/lib/supabase/server";

// Opções dos blocos do "Novo conteúdo" do admin (0075/0076): receitas publicadas, produtos da loja e
// programas publicados do herói escolhido. Muda junto com o herói responsável; só o admin chama.

const EMPTY: ComposerOptions = { recipes: [], products: [], programs: [] };

export async function loadContentBlockOptionsAction(creatorId: string | null): Promise<ComposerOptions> {
  const parsed = z.uuid().nullable().safeParse(creatorId);
  if (!parsed.success || !parsed.data) return EMPTY;
  const user = await getUser();
  if (!user || !(await hasRole("admin"))) return EMPTY;
  const supabase = await createClient();
  return loadComposerOptions(supabase, parsed.data);
}
