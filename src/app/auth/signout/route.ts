import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getOriginFromRequest } from "@/lib/auth/origin";
import { createClient } from "@/lib/supabase/server";

// Encerra a sessão (somente POST, via <form method="post">).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // "Sair" encerra a sessão deste aparelho; os outros aparelhos da pessoa continuam conectados
    await supabase.auth.signOut({ scope: "local" });
  }
  revalidatePath("/", "layout");
  return NextResponse.redirect(`${getOriginFromRequest(request)}/login`, { status: 303 });
}
