"use server";

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { BUSINESS_PROFILES, PROFILE_ONBOARDING_PATH, selfOnboardingError, startPathFor } from "@/lib/auth/profile-signup";
import { createClient } from "@/lib/supabase/server";

// Começar o passo a passo de um perfil (0103) para quem já tem conta: Configurações › "Quero ser…", "Já tenho conta"
// com um perfil escolhido e o Google. A RPC guarda a escolha (retoma se já houver) e aplica os limites.
export type StartProfileResult = { ok: false; error: string };

export async function startProfileAction(input: { profile: string }): Promise<StartProfileResult> {
  const parsed = z.object({ profile: z.enum(BUSINESS_PROFILES) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: (await getTranslations("invites.start.errors"))("unknown") };
  await requireUser(startPathFor(parsed.data.profile));
  const supabase = await createClient();
  const { error } = await supabase.rpc("self_onboarding_start", { p_kind: parsed.data.profile });
  if (error) return { ok: false, error: (await getTranslations("invites.start.errors"))(selfOnboardingError(error.message)) };
  redirect(PROFILE_ONBOARDING_PATH);
}
