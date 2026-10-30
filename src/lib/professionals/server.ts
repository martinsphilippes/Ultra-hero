import "server-only";
import { cache } from "react";
import { isCommerceEnabled } from "@/components/commerce/lib/settings";
import { getUser } from "@/lib/auth/session";
import { getNativeApp } from "@/lib/native-app/server";
import { createClient } from "@/lib/supabase/server";
import { hireAction, type HireAction } from "./rules";

// Contexto da contratação por request: app das lojas, kill switch do comércio e sessão.
export const loadHireEnv = cache(async () => {
  const [nativeApp, user, supabase] = await Promise.all([getNativeApp(), getUser(), createClient()]);
  let commerceEnabled = true;
  try {
    const { data } = await supabase.rpc("public_settings");
    commerceEnabled = isCommerceEnabled(data);
  } catch {
    // leitura falhou: o banco ainda confere no carrinho e no checkout
  }
  return { nativeApp: nativeApp !== null, commerceEnabled, userId: user?.id ?? null };
});

/** O que aparece no botão de um serviço deste profissional (dono = o próprio profissional). */
export async function hireActionFor(professionalUserId: string | null): Promise<HireAction> {
  const env = await loadHireEnv();
  return hireAction({
    nativeApp: env.nativeApp,
    commerceEnabled: env.commerceEnabled,
    loggedIn: env.userId !== null,
    ownService: env.userId !== null && env.userId === professionalUserId,
  });
}
