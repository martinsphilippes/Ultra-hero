import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { PARTNER_TERMS_VERSION } from "./version";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Herói ou agência só envia foto ou vídeo depois de confirmar os direitos sobre a versão vigente dos
// Termos do Parceiro (0068). Vale também para o admin agindo em nome de um herói: é a agência que publica
// por ele, e o aceite fica no nome de quem envia.
export async function hasUploadRights(supabase: Supabase, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("partner_terms_acceptances")
    .select("terms_version, upload_rights_confirmed_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return data.terms_version === PARTNER_TERMS_VERSION && data.upload_rights_confirmed_at !== null;
}
