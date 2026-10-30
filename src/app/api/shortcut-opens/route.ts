import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseShortcutOpen } from "@/lib/indicators";
import { createBumpLimiter } from "@/lib/recipes/showcase";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

// Indicador de atalhos (0060): aberturas de cada atalho da página do herói somadas por dia, herói e
// fonte. Nada da pessoa (sem id, sem IP). Resposta sempre 204; só o service role soma
// (shortcut_open_bump confere se o herói está ativo). Mesmo desenho de /api/recipe-actions.

const allow = createBumpLimiter(600, 60_000);
const done = () => new NextResponse(null, { status: 204 });

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 200) return done();
    const open = parseShortcutOpen(JSON.parse(text));
    if (!open) return done();
    // navegador do E2E (contra o banco remoto) não grava
    if ((await cookies()).get("uh-e2e")?.value === "1") return done();
    if (!hasAdminClient() || !allow(Date.now())) return done();
    // sem a 0060 a função não existe: o erro é ignorado
    await createAdminClient().rpc("shortcut_open_bump", { p_creator: open.creatorId, p_source: open.sourceKey });
  } catch {
    // contador nunca quebra a experiência
  }
  return done();
}
