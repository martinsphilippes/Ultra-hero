import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseBrandClick } from "@/lib/brands";
import { createBumpLimiter } from "@/lib/recipes/showcase";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

// Cliques para fora nas marcas e produtos (0062), somados por dia, alvo e origem. Nada da pessoa (sem
// id, sem IP). Resposta sempre 204; só o service role soma (brand_click_bump confere se o alvo está
// ativo). Mesmo desenho de /api/shortcut-opens.

const allow = createBumpLimiter(600, 60_000);
const done = () => new NextResponse(null, { status: 204 });

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 200) return done();
    const click = parseBrandClick(JSON.parse(text));
    if (!click) return done();
    // navegador do E2E (contra o banco remoto) não grava
    if ((await cookies()).get("uh-e2e")?.value === "1") return done();
    if (!hasAdminClient() || !allow(Date.now())) return done();
    // sem a 0062 a função não existe: o erro é ignorado
    await createAdminClient().rpc("brand_click_bump", { p_kind: click.kind, p_target: click.id, p_source: click.source });
  } catch {
    // contador nunca quebra a experiência
  }
  return done();
}
