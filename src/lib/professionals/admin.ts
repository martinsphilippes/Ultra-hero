import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ORDER_SELECT, PRO_SELECT, toOrder, toProfessional, type ProfessionalCardView, type ServiceOrderView } from "./queries";
import { responseStats } from "./rules";

// Leituras do admin (0058): todos os profissionais (a RLS libera ao admin), nota de conferência,
// sugeridos com nomes e as opções para ligar (heróis, receitas, programas).

export type AdminProfessionalRow = ProfessionalCardView & { isDemo: boolean; sortOrder: number; orders: number; pending: number; medianMinutes: number | null };

export async function listAdminProfessionals(status: string | null): Promise<{ available: boolean; rows: AdminProfessionalRow[] }> {
  try {
    const supabase = await createClient();
    let query = supabase.from("professionals").select(`${PRO_SELECT}, is_demo, sort_order`).order("status").order("sort_order").order("name").limit(300);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { available: false, rows: [] };
    const ids = (data ?? []).map((r) => r.id);
    const { data: orders } = ids.length
      ? await supabase.from("service_orders").select("professional_id, status, created_at, first_response_at").in("professional_id", ids).limit(5000)
      : { data: [] as { professional_id: string; status: string; created_at: string; first_response_at: string | null }[] };
    return {
      available: true,
      rows: (data ?? []).map((r) => {
        const mine = (orders ?? []).filter((o) => o.professional_id === r.id);
        const stats = responseStats(mine.map((o) => ({ createdAt: o.created_at, firstResponseAt: o.first_response_at })));
        return {
          ...toProfessional(r),
          isDemo: r.is_demo,
          sortOrder: r.sort_order,
          orders: mine.length,
          pending: mine.filter((o) => o.status === "pending").length,
          medianMinutes: stats.medianMinutes,
        };
      }),
    };
  } catch {
    return { available: false, rows: [] };
  }
}

export type AdminProfessional = AdminProfessionalRow & { verificationNote: string; verificationAt: string | null };

export async function getAdminProfessional(id: string): Promise<AdminProfessional | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("professionals").select(`${PRO_SELECT}, is_demo, sort_order`).eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: note } = await supabase.from("professional_verifications").select("note, updated_at").eq("professional_id", id).maybeSingle();
  return {
    ...toProfessional(data),
    isDemo: data.is_demo,
    sortOrder: data.sort_order,
    orders: 0,
    pending: 0,
    medianMinutes: null,
    verificationNote: note?.note ?? "",
    verificationAt: note?.updated_at ?? null,
  };
}

export type SuggestionTarget = "creator" | "content" | "program";
export type SuggestionItem = { target: SuggestionTarget; id: string; label: string };

export async function professionalSuggestions(professionalId: string): Promise<SuggestionItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("professional_suggestions")
    .select("creator_id, content_id, program_id, creator:creator_profiles(name), content:content(title), program:programs(slug)")
    .eq("professional_id", professionalId)
    .order("created_at");
  type Row = { creator_id: string | null; content_id: string | null; program_id: string | null; creator: { name: string } | null; content: { title: string } | null; program: { slug: string } | null };
  return ((data ?? []) as unknown as Row[]).map((r) =>
    r.creator_id
      ? { target: "creator" as const, id: r.creator_id, label: r.creator?.name ?? r.creator_id }
      : r.content_id
        ? { target: "content" as const, id: r.content_id, label: r.content?.title ?? r.content_id }
        : { target: "program" as const, id: r.program_id as string, label: r.program?.slug ?? (r.program_id as string) },
  );
}

export type SuggestionOptions = Record<SuggestionTarget, { id: string; label: string }[]>;

export async function suggestionOptions(): Promise<SuggestionOptions> {
  const supabase = await createClient();
  const [heroes, recipes, programs] = await Promise.all([
    supabase.from("creator_profiles").select("id, name").eq("status", "active").order("sort_order").limit(200),
    supabase.from("content").select("id, title").eq("type", "recipe").eq("status", "published").order("title").limit(500),
    supabase.from("programs").select("id, slug").eq("status", "published").order("slug").limit(200),
  ]);
  return {
    creator: (heroes.data ?? []).map((h) => ({ id: h.id, label: h.name })),
    content: (recipes.data ?? []).map((r) => ({ id: r.id, label: r.title })),
    program: (programs.data ?? []).map((p) => ({ id: p.id, label: p.slug })),
  };
}

export async function adminProfessionalOrders(professionalId: string): Promise<ServiceOrderView[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("service_orders").select(ORDER_SELECT).eq("professional_id", professionalId).order("created_at", { ascending: false }).limit(200);
  return ((data ?? []) as unknown as Parameters<typeof toOrder>[0][]).map(toOrder);
}
