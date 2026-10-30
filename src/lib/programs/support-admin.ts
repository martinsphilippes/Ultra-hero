import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { createClient } from "@/lib/supabase/server";

// Dados do painel "Produto e profissional" no admin do programa (0059). Leitura como admin (a RLS
// libera tudo para is_admin). Sem a 0059: available=false (produtos e serviço escondidos; os
// profissionais sugeridos da 0058 continuam editáveis). Sem a 0058: listas vazias.

type Option = { id: string; label: string };

export type ProgramSupportAdmin = {
  available: boolean;
  products: { productId: string; label: string; note: string }[];
  productOptions: Option[];
  professionals: { id: string; label: string; serviceId: string | null; services: Option[] }[];
  professionalOptions: Option[];
};

export async function loadProgramSupportAdmin(programId: string): Promise<ProgramSupportAdmin> {
  const supabase = await createClient();
  const [tp, locale] = await Promise.all([getTranslations("professionals"), getLocale()]);
  const [linksRes, productsRes, suggestionsRes, prosRes] = await Promise.all([
    supabase.from("program_products").select("product_id, note, sort_order, product:products(title)").eq("program_id", programId).order("sort_order"),
    supabase.from("products").select("id, title, status").order("title").limit(500),
    supabase.from("professional_suggestions").select("professional_id, service_id, created_at").eq("program_id", programId).order("created_at"),
    supabase.from("professionals").select("id, name, specialty, status").order("name").limit(300),
  ]);
  const available = !linksRes.error && !suggestionsRes.error;

  // sem a 0059 a coluna service_id não existe: relê os sugeridos sem ela
  let suggestions: { professional_id: string; service_id: string | null }[] = (suggestionsRes.data ?? []).map((r) => ({ professional_id: r.professional_id, service_id: r.service_id }));
  if (suggestionsRes.error) {
    const plain = await supabase.from("professional_suggestions").select("professional_id, created_at").eq("program_id", programId).order("created_at");
    suggestions = (plain.data ?? []).map((r) => ({ professional_id: r.professional_id, service_id: null }));
  }
  const pros = prosRes.data ?? [];
  const proLabel = (p: { name: string; specialty: string; status: string }) =>
    `${p.name} · ${tp.has(`specialty.${p.specialty}`) ? tp(`specialty.${p.specialty}`) : p.specialty}${p.status === "approved" ? "" : ` (${p.status})`}`;
  const ids = suggestions.map((s) => s.professional_id);
  const servicesRes = ids.length > 0 ? await supabase.from("professional_services").select("id, professional_id, title, price_cents, is_active, admin_disabled").in("professional_id", ids).order("sort_order") : null;
  const services = servicesRes?.data ?? [];
  const byId = new Map(pros.map((p) => [p.id, p]));

  type LinkRow = { product_id: string; note: string; product: { title: string } | { title: string }[] | null };
  return {
    available,
    products: ((linksRes.data ?? []) as unknown as LinkRow[]).map((r) => {
      const product = Array.isArray(r.product) ? r.product[0] : r.product;
      return { productId: r.product_id, label: product?.title ?? r.product_id, note: r.note ?? "" };
    }),
    productOptions: (productsRes.data ?? []).map((p) => ({ id: p.id, label: p.status === "published" ? p.title : `${p.title} (${p.status})` })),
    professionals: suggestions.map((s) => {
      const pro = byId.get(s.professional_id);
      return {
        id: s.professional_id,
        label: pro ? proLabel(pro) : s.professional_id,
        serviceId: s.service_id,
        services: services
          .filter((sv) => sv.professional_id === s.professional_id)
          .map((sv) => ({
            id: sv.id,
            label: `${sv.title} · ${formatCurrency(sv.price_cents / 100, locale as Locale)}${sv.is_active && !sv.admin_disabled ? "" : " ✕"}`,
          })),
      };
    }),
    professionalOptions: pros.map((p) => ({ id: p.id, label: proLabel(p) })),
  };
}
