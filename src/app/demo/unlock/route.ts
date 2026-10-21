import { NextResponse, type NextRequest } from "next/server";
import { checkDemoCode, DEMO_UNLOCK_COOKIE, demoUnlockToken } from "@/lib/demo/server";

// Libera o painel de acesso rápido neste navegador (30 dias). Formulário comum (POST + 303): funciona
// com ou sem JavaScript e sempre volta ao Início já renderizado com o cookie novo.
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const home = new URL("/", request.url);
  const token = demoUnlockToken();
  if (!form || !token || !checkDemoCode(form.get("code"))) {
    home.searchParams.set("demo", "code");
    return NextResponse.redirect(home, 303);
  }
  const response = NextResponse.redirect(home, 303);
  response.cookies.set(DEMO_UNLOCK_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    // Seguro onde há HTTPS (Vercel); o servidor local de teste roda em http.
    secure: process.env.VERCEL === "1",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
