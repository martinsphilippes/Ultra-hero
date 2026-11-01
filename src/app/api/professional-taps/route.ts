import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseProfessionalTap } from "@/lib/professionals/rules";
import { createBumpLimiter } from "@/lib/recipes/showcase";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

// Indicador de contratação (0058): toques em "Contratar" e "Ver perfil" somados por dia, profissional,
// herói, origem e ação. Nada da pessoa (sem id, sem IP). Resposta sempre 204; só o service role soma
// (professional_tap_bump confere se o profissional está aprovado). Mesmo desenho de /api/recipe-actions.

const allow = createBumpLimiter(600, 60_000);
const done = () => new NextResponse(null, { status: 204 });

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 400) return done();
    const tap = parseProfessionalTap(JSON.parse(text));
    if (!tap) return done();
    // navegador do E2E (contra o banco remoto) não grava
    if ((await cookies()).get("uh-e2e")?.value === "1") return done();
    if (!hasAdminClient() || !allow(Date.now())) return done();
    // sem a 0058 a função não existe: o erro é ignorado
    await createAdminClient().rpc("professional_tap_bump", {
      p_professional: tap.professionalId,
      // p_creator não tem valor padrão no banco: sem herói vai como null explícito (undefined some do JSON e dá 404)
      p_creator: tap.creatorId,
      p_source: tap.source,
      p_action: tap.action,
    });
  } catch {
    // contador nunca quebra a experiência
  }
  return done();
}
