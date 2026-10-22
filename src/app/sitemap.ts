import type { MetadataRoute } from "next";
import { getOrigin } from "@/lib/auth/origin";
import { recipesSeoIndexEnabled } from "@/lib/recipes/jsonld";
import { createClient } from "@/lib/supabase/server";

// revalidado de hora em hora (com o interruptor ligado, receitas novas entram sem novo deploy)
export const revalidate = 3600;

const PAGE = 48;
const MAX_PAGES = 40;

// Sitemap das receitas no ar, só com RECIPES_SEO_INDEX ligada (P6). Desligada, sai vazio: nada é
// promovido nos buscadores enquanto os chefs forem fictícios. Lê o catálogo como visitante (a RLS
// e o content_is_live da recipe_catalog garantem que só entra o que está no ar).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!recipesSeoIndexEnabled()) return [];
  const [origin, supabase] = await Promise.all([getOrigin(), createClient()]);
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase.rpc("recipe_catalog", { p_sort: "recent", p_limit: PAGE, p_cursor: cursor });
    if (error || !data?.length) break;
    ids.push(...data.map((r) => r.content_id));
    if (data.length < PAGE) break;
    cursor = data[data.length - 1].cursor;
  }
  if (ids.length === 0) return [];
  const { data: rows } = await supabase.from("content").select("slug, updated_at").in("id", ids);
  return (rows ?? []).map((r) => ({ url: `${origin}/content/${r.slug}`, lastModified: r.updated_at, changeFrequency: "weekly" as const }));
}
