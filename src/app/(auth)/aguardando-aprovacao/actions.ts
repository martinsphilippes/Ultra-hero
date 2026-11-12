"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PENDING_PATH } from "@/lib/access/gate";
import { getMyAccess } from "@/lib/access/presidency";
import { heroChannelBlocked } from "@/lib/access/server";
import { CHOOSABLE_PROFILES, onboardingKindAfterApproval } from "@/lib/access/status";
import { acceptMyInvitations } from "@/lib/auth/invite-first-access";
import { PROFILE_ONBOARDING_PATH, startPathFor } from "@/lib/auth/profile-signup";
import { LOGIN_HOME } from "@/lib/auth/safe-next";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type PendingActionState = { status: "idle" } | { status: "saved" } | { status: "error"; error: "creatorAppOnly" | "notPending" | "unknown" };

/**
 * "Atualizar situação" e "Continuar": consulta o banco; aprovada → renova o token (que ainda diz "pendente"), aceita os
 * convites do e-mail e abre o passo a passo do perfil pedido (ou a aba Hero). Pendente/recusada → só redesenha a tela.
 */
export async function refreshAccessAction(): Promise<void> {
  const user = await getUser();
  if (!user) redirect("/login");
  const result = await getMyAccess();
  if (!result.available || result.access.status !== "approved") {
    revalidatePath(PENDING_PATH);
    redirect(PENDING_PATH);
  }
  const supabase = await createClient();
  await supabase.auth.refreshSession();

  const access = result.access;
  // Hero: só pelo aplicativo (no navegador a sessão nem chega aqui, mas a action pode ser chamada de qualquer caminho)
  if (access.appOnly && (await heroChannelBlocked())) redirect(PENDING_PATH);

  // convites do e-mail (equipe da agência, marca, Hero da agência…) entram agora, depois da aprovação
  const home = await acceptMyInvitations(supabase);
  if (home) redirect(LOGIN_HOME);

  // perfil de negócio pedido no cadastro: abre o passo a passo (a RPC retoma o que já existir)
  const kind = onboardingKindAfterApproval(access.requestedProfile);
  if (kind) {
    const { error } = await supabase.rpc("self_onboarding_start", { p_kind: kind });
    redirect(error ? startPathFor(kind) : PROFILE_ONBOARDING_PATH);
  }
  redirect(LOGIN_HOME);
}

const chooseSchema = z.object({ profile: z.enum(CHOOSABLE_PROFILES) });

/** Quem entrou com Google/Apple sem escolher o perfil confirma "Como você vai usar o Ultra?" enquanto espera. */
export async function chooseProfileAction(_prev: PendingActionState, formData: FormData): Promise<PendingActionState> {
  const parsed = chooseSchema.safeParse({ profile: formData.get("profile") });
  if (!parsed.success) return { status: "error", error: "unknown" };
  const user = await getUser();
  if (!user) redirect("/login");
  // Hero/Creator: cadastro só pelo aplicativo
  if (parsed.data.profile === "hero" && (await heroChannelBlocked())) return { status: "error", error: "creatorAppOnly" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("account_request_profile", { p_profile: parsed.data.profile });
  if (error) return { status: "error", error: error.message.includes("not_pending") ? "notPending" : "unknown" };
  // o token passa a dizer app_only quando o perfil é Hero
  await supabase.auth.refreshSession();
  revalidatePath(PENDING_PATH);
  return { status: "saved" };
}
