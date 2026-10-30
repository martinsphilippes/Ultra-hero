import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getOriginFromRequest } from "@/lib/auth/origin";
import { PUSH_TOKEN_COOKIE } from "@/lib/push/constants";
import { createClient } from "@/lib/supabase/server";

// Encerra a sessão (somente POST, via <form method="post">).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // app das lojas: este aparelho para de receber os avisos da conta que saiu (melhor esforço)
    const pushToken = request.cookies.get(PUSH_TOKEN_COOKIE)?.value;
    if (pushToken) await supabase.from("push_tokens").delete().eq("token", pushToken).eq("user_id", user.id);
    // "Sair" encerra a sessão deste aparelho; os outros aparelhos da pessoa continuam conectados
    await supabase.auth.signOut({ scope: "local" });
  }
  revalidatePath("/", "layout");
  const response = NextResponse.redirect(`${getOriginFromRequest(request)}/login`, { status: 303 });
  response.cookies.delete(PUSH_TOKEN_COOKIE);
  return response;
}
