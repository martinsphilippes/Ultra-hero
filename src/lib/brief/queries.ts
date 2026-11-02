import "server-only";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Modelos de briefing da marca (0080): a RLS devolve só os da marca da pessoa.

export type BriefTemplate = { id: string; name: string; updatedAt: string; deliverableCount: number; hasBrief: boolean };

export async function listBriefTemplates(brandId: string): Promise<{ available: boolean; items: BriefTemplate[] }> {
  if (!/^[0-9a-f-]{36}$/i.test(brandId)) return { available: true, items: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.from("brand_brief_templates").select("id, name, data, updated_at").eq("brand_id", brandId).order("name").limit(50);
  if (error) return { available: !isMissingSchema(error), items: [] };
  return {
    available: true,
    items: (data ?? []).map((r) => {
      const d = (r.data && typeof r.data === "object" && !Array.isArray(r.data) ? r.data : {}) as Record<string, unknown>;
      const brief = d.brief && typeof d.brief === "object" && !Array.isArray(d.brief) ? (d.brief as Record<string, unknown>) : {};
      return { id: r.id, name: r.name, updatedAt: r.updated_at, deliverableCount: Array.isArray(d.deliverables) ? d.deliverables.length : 0, hasBrief: Object.keys(brief).length > 0 };
    }),
  };
}
