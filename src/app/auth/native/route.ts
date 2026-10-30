import { NextResponse, type NextRequest } from "next/server";
import { nativeAuthRedirect } from "@/lib/native-app/surface";

// Volta do OAuth iniciado no app das lojas. Roda no navegador do sistema (o Google recusa WebView):
// devolve código e destino ao app pelo esquema gchero://, e a casca abre /auth/callback na WebView,
// onde está o verificador PKCE. Sem ele o código não troca por sessão, então interceptá-lo não basta.
export function GET(request: NextRequest) {
  return NextResponse.redirect(nativeAuthRedirect(request.nextUrl.searchParams), 302);
}
