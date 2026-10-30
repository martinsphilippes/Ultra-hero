import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseHeroPageView } from "@/lib/indicators";
import { createBumpLimiter } from "@/lib/recipes/showcase";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

// Visitas à página do herói (0061): somadas por dia e herói. Nada da pessoa (sem id, sem IP).
// Resposta sempre 204; só o service role soma (hero_page_view_bump confere se o herói está ativo).
// Mesmo desenho de /api/shortcut-opens.

const allow = createBumpLimiter(600, 60_000);
const done = () => new NextResponse(null, { status: 204 });

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 200) return done();
    const view = parseHeroPageView(JSON.parse(text));
    if (!view) return done();
    // navegador do E2E (contra o banco remoto) não grava
    if ((await cookies()).get("uh-e2e")?.value === "1") return done();
    if (!hasAdminClient() || !allow(Date.now())) return done();
    // sem a 0061 a função não existe: o erro é ignorado
    await createAdminClient().rpc("hero_page_view_bump", { p_creator: view.creatorId });
  } catch {
    // contador nunca quebra a experiência
  }
  return done();
}
