"use server";

import { revalidatePath } from "next/cache";
import { phoneOnlySchema } from "@/lib/auth/quick-signup";
import { isDemoUser, isMissingSchema, readGeneratedPassword, rotateGeneratedPassword } from "@/lib/auth/quick-signup-server";
import { isPasswordVaultConfigured } from "@/lib/auth/password-crypto";
import { getUser } from "@/lib/auth/session";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Perfil › Conta: senha gerada (ver, gerar outra) e celular. A senha só sai daqui para a PRÓPRIA
// pessoa da sessão; nunca vai para log, analytics ou URL.

type Fail = { ok: false; error: "unauthenticated" | "unavailable" | "demo" | "none" | "invalidPhone" | "generic" };

const DEMO_EMAILS = DEMO_ACCOUNTS.map((a) => a.email);

export async function revealMyPassword(): Promise<{ ok: true; password: string } | Fail> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (!hasAdminClient() || !isPasswordVaultConfigured()) return { ok: false, error: "unavailable" };
  const state = await readGeneratedPassword(createAdminClient(), user.id);
  if (state.status === "ok") return { ok: true, password: state.password };
  return { ok: false, error: state.status === "none" ? "none" : "unavailable" };
}

export async function regenerateMyPassword(): Promise<{ ok: true; password: string; stored: boolean } | Fail> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  // contas de demonstração: a senha é compartilhada (trocar derrubaria o acesso de todo mundo)
  if (isDemoUser(user, DEMO_EMAILS)) return { ok: false, error: "demo" };
  if (!hasAdminClient() || !isPasswordVaultConfigured()) return { ok: false, error: "unavailable" };
  const rotated = await rotateGeneratedPassword(createAdminClient(), user.id);
  if (!rotated) return { ok: false, error: "generic" };
  // quem soubesse a senha antiga perde as outras sessões; este aparelho continua
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "others" });
  revalidatePath("/profile/account");
  return { ok: true, password: rotated.password, stored: rotated.stored };
}

export async function updateMyPhone(input: { phone: string }): Promise<{ ok: true; phone: string | null } | Fail> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const raw = typeof input?.phone === "string" ? input.phone.trim() : "";
  let phone: string | null = null;
  if (raw !== "") {
    const parsed = phoneOnlySchema.safeParse({ phone: raw });
    if (!parsed.success) return { ok: false, error: "invalidPhone" };
    phone = parsed.data.phone;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ phone_e164: phone }).eq("id", user.id);
  if (error) return { ok: false, error: isMissingSchema(error) ? "unavailable" : "generic" };
  revalidatePath("/profile/account");
  return { ok: true, phone };
}
