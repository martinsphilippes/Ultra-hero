import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth/session";
import { EMPTY_MINE, fetchCollectible, fetchMyCollectibleState, finalizeIfDue } from "@/lib/collectibles/queries";
import { createClient } from "@/lib/supabase/server";

// Estado de um colecionável para a tela ao vivo: reserva quando o Realtime não conecta (consulta a
// cada ~3 s) e conferência periódica. Sob a RLS da sessão: lances públicos sem id de usuário e,
// para quem está logado, só os próprios lances. Traz a hora do servidor para corrigir o relógio.
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { "Cache-Control": "no-store" };
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  const [supabase, user] = await Promise.all([createClient(), getUser()]);
  let loaded = await fetchCollectible(supabase, id);
  if (!loaded) return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  if (await finalizeIfDue(supabase, loaded.item, Boolean(user))) loaded = (await fetchCollectible(supabase, id)) ?? loaded;
  const mine = user ? await fetchMyCollectibleState(supabase, id) : EMPTY_MINE;
  return NextResponse.json({ ...loaded, mine, serverNow: Date.now() }, { headers });
}
