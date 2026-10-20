"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/editors/types";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { failFrom } from "../_lib/action-utils";

// Sugestão de vínculo conteúdo ↔ produto pela personalidade. O admin valida; mudanças
// significativas no produto suspendem vínculos validados (trigger no banco).

export type ProductHit = {
  id: string;
  title: string;
  image_url: string;
  price_cents_demo: number;
  seller: string | null;
};

type SearchResult = { ok: true; products: ProductHit[] } | { ok: false; error: string };

export async function searchProducts(input: { q: string }): Promise<SearchResult> {
  const parsed = z.object({ q: z.string().trim().min(2).max(80) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const supabase = await createClient();
  // Escapa curingas do ILIKE; RLS já limita a produtos regulares de fornecedores ativos.
  const pattern = `%${parsed.data.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const { data, error } = await supabase
    .from("products")
    .select("id, title, image_url, price_cents_demo, seller:seller_organizations(name)")
    .eq("status", "published")
    .eq("moderation_status", "clear")
    .eq("availability", "available")
    .or("demo_stock.is.null,demo_stock.gt.0")
    .ilike("title", pattern)
    .order("title")
    .limit(10);
  if (error) return failFrom(error);
  const products: ProductHit[] = (data ?? []).map((p) => {
    const seller = Array.isArray(p.seller) ? p.seller[0] : p.seller;
    return { id: p.id, title: p.title, image_url: p.image_url, price_cents_demo: p.price_cents_demo, seller: (seller as { name: string } | null)?.name ?? null };
  });
  return { ok: true, products };
}

export async function suggestLink(input: { contentId: string; productId: string; note: string }): Promise<ActionResult> {
  const parsed = z.object({ contentId: z.uuid(), productId: z.uuid(), note: z.string().trim().max(300) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const supabase = await createClient();
  const { data: creatorId } = await supabase.rpc("my_creator_id");
  if (!creatorId) return { ok: false, error: "creator_unavailable" };
  const { error } = await supabase.from("content_product_links").insert({
    content_id: parsed.data.contentId,
    product_id: parsed.data.productId,
    status: "suggested",
    suggested_by_creator: creatorId,
    suggested_by: user.id,
    note: parsed.data.note || null,
  });
  if (error) {
    const failure = failFrom(error);
    return failure.error === "duplicate" ? { ok: false, error: "link_exists" } : failure;
  }
  revalidatePath("/creator/links");
  return { ok: true };
}

export async function deleteLink(input: { id: string }): Promise<ActionResult> {
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const supabase = await createClient();
  // RLS: só vínculos próprios ainda "sugeridos".
  const { error, count } = await supabase.from("content_product_links").delete({ count: "exact" }).eq("id", parsed.data.id).eq("status", "suggested");
  if (error) return failFrom(error);
  if (!count) return { ok: false, error: "link_not_deletable" };
  revalidatePath("/creator/links");
  return { ok: true };
}
