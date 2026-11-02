import { NextResponse } from "next/server";
import { isLinkPreviewBot, safeHttpsDestination, trackingCodeOk } from "@/lib/media/metrics";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

// Link rastreável da campanha (0083): público, sem login. O servidor registra o clique com o service role
// (tracking_link_click é SQL comum, só para service_role — nenhuma função nova executável pelo visitante) e
// redireciona ao destino https da marca, conferido de novo aqui. Robôs de pré-visualização (WhatsApp, redes,
// buscadores) e HEAD não contam clique: o destino vem da leitura sem incremento. Código inválido ou destino fora
// do https → 404 simples (nunca um redirecionamento aberto).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

function notFound() {
  return new NextResponse("Link indisponível.", { status: 404, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}

async function resolve(request: Request, code: string, count: boolean): Promise<NextResponse> {
  if (!trackingCodeOk(code) || !hasAdminClient()) return notFound();
  const admin = createAdminClient();
  let destination: string | null = null;
  if (count) {
    const { data, error } = await admin.rpc("tracking_link_click", { p_code: code.toLowerCase() });
    if (error) return notFound();
    destination = typeof data === "string" ? data : null;
  } else {
    const { data } = await admin.from("campaign_tracking_links").select("destination_url").eq("code", code.toLowerCase()).maybeSingle();
    destination = data?.destination_url ?? null;
  }
  const safe = safeHttpsDestination(destination);
  if (!safe) return notFound();
  return NextResponse.redirect(safe, { status: 302, headers: HEADERS });
}

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const { code } = await params;
  return resolve(request, code, !isLinkPreviewBot(request.headers.get("user-agent")));
}

export async function HEAD(request: Request, { params }: Ctx) {
  const { code } = await params;
  return resolve(request, code, false);
}
