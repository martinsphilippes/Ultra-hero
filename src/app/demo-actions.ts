"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { demoAccount } from "@/lib/demo/accounts";
import { checkDemoCode, DEMO_UNLOCK_COOKIE, demoPassword, demoUnlockToken, isDemoUnlocked } from "@/lib/demo/server";
import { createClient } from "@/lib/supabase/server";

export type DemoUnlockState = { status: "idle" | "error" };

// Libera o painel de acesso rápido neste navegador (30 dias) quando o código confere.
export async function unlockDemoAccess(_prev: DemoUnlockState, formData: FormData): Promise<DemoUnlockState> {
  if (!checkDemoCode(formData.get("code"))) return { status: "error" };
  const value = demoUnlockToken();
  if (!value) return { status: "error" };
  (await cookies()).set(DEMO_UNLOCK_COOKIE, value, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}

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
