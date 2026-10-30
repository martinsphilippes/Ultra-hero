import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createBumpLimiter, parseRecipeActionEvent } from "@/lib/recipes/showcase";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

// Contador de toques da Alimentação (0051): fazer / comprar pronto / lista de compras, somados por
// dia, herói da vitrine, origem e receita. Nada da pessoa (sem id, sem IP). O navegador manda por
// sendBeacon e não espera: a resposta é sempre 204 e nenhuma falha chega à tela. Só o service role
// soma (recipe_action_bump confere se a receita está mesmo na vitrine do herói).

// limite ingênuo por instância: um laço de chamadas não enche o banco
const allow = createBumpLimiter(600, 60_000);
const done = () => new NextResponse(null, { status: 204 });

export async function POST(request: Request) {
  try {
    // corpo pequeno: um evento
    const text = await request.text();
    if (text.length > 400) return done();
    const event = parseRecipeActionEvent(JSON.parse(text));
    if (!event) return done();
    // navegador do E2E (contra o banco remoto) não grava
    if ((await cookies()).get("uh-e2e")?.value === "1") return done();
    if (!hasAdminClient() || !allow(Date.now())) return done();
    // sem a 0051 a função não existe: o erro é ignorado
    await createAdminClient().rpc("recipe_action_bump", {
      p_creator: event.creatorId,
      p_source: event.source,
      p_action: event.action,
      p_content: event.contentId,
    });
  } catch {
    // contador nunca quebra a experiência
  }
  return done();
}
