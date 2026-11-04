"use server";

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { profileConflictParams } from "@/lib/auth/profile-conflict";
import { BUSINESS_PROFILES, PROFILE_ONBOARDING_PATH, selfOnboardingError, startPathFor } from "@/lib/auth/profile-signup";
import { createClient } from "@/lib/supabase/server";

// Continuar o cadastro por perfil (0103) depois de entrar: "Já tenho conta" com um perfil escolhido e o Google. A RPC
// guarda a escolha (retoma se já houver) e aplica os limites. 0116: sem atalho "Quero ser…" nas Configurações; conta
// que já tem outro perfil de negócio é recusada (profile_conflict:<tipo>).
export type StartProfileResult = { ok: false; error: string };

export async function startProfileAction(input: { profile: string }): Promise<StartProfileResult> {
  const parsed = z.object({ profile: z.enum(BUSINESS_PROFILES) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: (await getTranslations("invites.start.errors"))("unknown") };
  await requireUser(startPathFor(parsed.data.profile));
  const supabase = await createClient();
  const { error } = await supabase.rpc("self_onboarding_start", { p_kind: parsed.data.profile });
  if (error) {
    const t = await getTranslations("invites.start.errors");
    const code = selfOnboardingError(error.message);
    return { ok: false, error: code === "profile_conflict" ? t(code, profileConflictParams(error)) : t(code) };
  }
  redirect(PROFILE_ONBOARDING_PATH);
}
