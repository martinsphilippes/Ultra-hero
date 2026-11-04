"use server";

import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// "Me avise quando abrir" (modo Coming soon da aba Comprar). Sem migração: liga o opt-in que já existe
// para o comércio (notification_preferences.commerce_updates, 0018; respeita os canais da pessoa) e
// registra o pedido explícito como evento "shop.launch_notify" em analytics_events (a lista de quem pediu
// o aviso de abertura sai daí). Nada é enviado agora: o envio no dia da abertura é uma tarefa à parte.

export type NotifyShopLaunchResult = { ok: true } | { ok: false; error: "unauthenticated" | "generic" };

export async function notifyShopLaunch(): Promise<NotifyShopLaunchResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  try {
    const supabase = await createClient();
    // só a coluna informada é atualizada quando a linha já existe (as outras preferências ficam)
    const { error } = await supabase.from("notification_preferences").upsert({ user_id: user.id, commerce_updates: true }, { onConflict: "user_id" });
    if (error) return { ok: false, error: "generic" };
    await trackEvent("shop.launch_notify", {});
    return { ok: true };
  } catch {
    return { ok: false, error: "generic" };
  }
}
