"use server";

import { redirect } from "next/navigation";
import { demoAccount, demoOrigin, DEMO_ORIGINS } from "@/lib/demo/accounts";
import { demoPassword } from "@/lib/demo/server";
import { createClient } from "@/lib/supabase/server";

// Entra numa conta de demonstração com um toque. A senha nunca sai do servidor; sem ela configurada,
// a ação não faz nada além de voltar para a tela de origem.
export async function signInAsDemo(formData: FormData): Promise<void> {
  const origin = DEMO_ORIGINS[demoOrigin(formData.get("from"))];
  const account = demoAccount(String(formData.get("kind") ?? ""));
  const password = demoPassword();
  if (!account || !password) redirect(origin);
  const supabase = await createClient();
  // só este aparelho: o escopo padrão (global) derrubaria quem mais estiver usando a mesma conta demo
  await supabase.auth.signOut({ scope: "local" });
  const { error } = await supabase.auth.signInWithPassword({ email: account.email, password });
  if (error) redirect(`${origin}?demo=error`);
  redirect(account.home);
}
