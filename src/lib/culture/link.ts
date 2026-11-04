import "server-only";
import { createClient } from "@/lib/supabase/server";

// Vínculo proposta ↔ evento (0101). Chamado pelas server actions de salvar campanha, chamada e patrocínio, logo depois
// do salvamento de sempre e ANTES de enviar/publicar. O banco confere quem pode e se o evento é visível a quem liga.
// Falhar aqui não desfaz o rascunho salvo: a action avisa que o vínculo não foi gravado (o item segue editável).

export type LinkKind = "campaign" | "brand_call" | "sponsorship";

export async function linkToEvent(kind: LinkKind, id: string, eventId: string, segments: readonly string[] = []): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("commercial_event_link", { p_kind: kind, p_id: id, p_event: eventId, p_segments: segments.length > 0 ? [...segments] : null });
  return error ? { ok: false, error } : { ok: true };
}
