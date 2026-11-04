import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_HOME } from "@/lib/auth/safe-next";
import { EXPLORE_COOKIE, EXPLORE_COOKIE_MAX_AGE } from "@/lib/institutional/root";

// "Pular e explorar" da página institucional: guarda a escolha (o "/" passa a abrir o app neste navegador) e leva à
// aba Hero. Link comum (<a>, sem prefetch), então só roda quando a pessoa clica. Não exige nem altera sessão.
export function GET(request: NextRequest) {
  const target = request.nextUrl.clone();
  target.pathname = LOGIN_HOME;
  target.search = "";
  const response = NextResponse.redirect(target, 303);
  response.cookies.set(EXPLORE_COOKIE, "1", {
    path: "/",
    maxAge: EXPLORE_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
