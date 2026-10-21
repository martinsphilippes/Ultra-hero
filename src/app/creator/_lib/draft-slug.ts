import "server-only";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { failFrom, type ActionFailure } from "./action-utils";
import type { CreatorActionContext } from "./creator-action";
import { uniqueSlug } from "./slug";

// Slug definitivo a partir do título final: o rascunho do composer nasce com o título provisório
// ("post-em-video-…"). Vale para o composer e para o Publicar do editor, senão o post iria ao ar
// com o slug provisório para sempre (depois de publicado a RPC recusa a troca). Em colisão tenta
// outro sufixo uma vez.
export async function setDraftSlug(ctx: CreatorActionContext, contentId: string, title: string): Promise<ActionFailure | null> {
  let lastError: { message?: string; code?: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await ctx.supabase.rpc("creator_set_draft_slug", { p_content: contentId, p_slug: uniqueSlug(title) });
    if (!error) return null;
    lastError = error;
    if (rpcErrorCode(error.message) !== "slug_taken") break;
  }
  return failFrom(lastError);
}
