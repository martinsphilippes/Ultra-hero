import "server-only";
import type { InterestGroup } from "@/components/me/InterestTagGrid";
import type { Locale } from "@/i18n/config";
import { localizedLabel } from "@/lib/catalog/queries";
import { PILLARS, type Pillar } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Temas de interesse agrupados por pilar e as escolhas da pessoa (onboarding, etapa de receitas).
export async function loadInterestGroups(userId: string, locale: Locale): Promise<{ groups: InterestGroup[]; selected: string[] }> {
  const supabase = await createClient();
  const [tagsRes, mineRes] = await Promise.all([
    supabase.from("interest_tags").select("tag, label, pillar, sort_order").order("sort_order", { ascending: true }),
    supabase.from("user_interests").select("tag").eq("user_id", userId),
  ]);
  if (tagsRes.error) throw new Error(tagsRes.error.message);
  const byPillar = new Map<Pillar | null, InterestGroup["tags"]>();
  for (const row of tagsRes.data ?? []) {
    const key = (row.pillar as Pillar | null) ?? null;
    if (!byPillar.has(key)) byPillar.set(key, []);
    byPillar.get(key)!.push({ tag: row.tag, label: localizedLabel(row.label, locale) || row.tag });
  }
  const groups = [...PILLARS, null].filter((p) => byPillar.has(p)).map((pillar) => ({ pillar, tags: byPillar.get(pillar)! }));
  return { groups, selected: (mineRes.data ?? []).map((r) => r.tag) };
}
