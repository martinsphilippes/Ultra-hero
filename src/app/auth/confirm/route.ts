import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getOriginFromRequest } from "@/lib/auth/origin";
import { LOGIN_HOME, safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

// Confirma links de e-mail com token_hash (modelo de e-mail: /auth/confirm?token_hash=...&type=...).
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = getOriginFromRequest(request);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next");
  // Recuperação de senha sem `next` explícito vai direto para a troca de senha.
  const next = safeNext(rawNext, type === "recovery" ? "/reset-password" : LOGIN_HOME);

  if (!tokenHash || !type || !OTP_TYPES.includes(type)) {
    return NextResponse.redirect(`${origin}/login?error=invalidLink`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalidLink`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
