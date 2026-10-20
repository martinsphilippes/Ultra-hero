import { NextResponse, type NextRequest } from "next/server";
import { getOriginFromRequest } from "@/lib/auth/origin";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

// Troca o código PKCE (OAuth, confirmação, recuperação) por sessão e segue para `next`.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = getOriginFromRequest(request);
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");

  if (searchParams.get("error") || searchParams.get("error_code")) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=callback`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=callback`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
