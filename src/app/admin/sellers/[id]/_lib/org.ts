import "server-only";
import { cache } from "react";
import type { Tables } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Organização da URL (cabeçalho, abas e páginas), uma leitura por requisição. null = id inválido ou inexistente.
export const getAdminSellerOrg = cache(async (id: string): Promise<Tables<"seller_organizations"> | null> => {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("seller_organizations").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
});
