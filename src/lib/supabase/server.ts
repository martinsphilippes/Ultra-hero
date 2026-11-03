import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ACTING_HERO_HEADER } from "@/lib/acting-hero/constants";
import { MY_HERO_HEADER } from "@/lib/creator-content/rules";
import type { Database } from "./database.types";

type ClientOptions = {
  /** Fluxo "Publicar como hero" do admin: o banco só honra o cabeçalho para admin (0045). */
  actingHeroId?: string | null;
  /** Creator em mais de uma equipe de herói: o herói escolhido (o banco só honra para membro ativo, 0092). */
  myHeroId?: string | null;
};

// Cliente Supabase para Server Components, Server Actions e Route Handlers.
// Sempre sob RLS (sessão do usuário). Para rotinas de sistema use admin.ts.
export async function createClient(options: ClientOptions = {}) {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      ...(options.actingHeroId
        ? { global: { headers: { [ACTING_HERO_HEADER]: options.actingHeroId } } }
        : options.myHeroId
          ? { global: { headers: { [MY_HERO_HEADER]: options.myHeroId } } }
          : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado de um Server Component: o middleware cuida de renovar a sessão.
          }
        },
      },
    },
  );
}
