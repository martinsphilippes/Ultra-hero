"use server";

import { redirect } from "next/navigation";
import { demoAccount } from "@/lib/demo/accounts";
import { demoPassword, isDemoUnlocked } from "@/lib/demo/server";
import { createClient } from "@/lib/supabase/server";

// Entra numa conta de demonstração. Só funciona com o painel liberado; a senha nunca sai do servidor.
export async function signInAsDemo(formData: FormData): Promise<void> {
  const account = demoAccount(String(formData.get("kind") ?? ""));
  const password = demoPassword();
  if (!account || !password || !(await isDemoUnlocked())) redirect("/");
  const supabase = await createClient();
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email: account.email, password });
  if (error) redirect("/?demo=error");
  redirect(account.home);
}
