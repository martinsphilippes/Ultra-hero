import "server-only";
import { cache } from "react";
import { getUser, hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isShopComingSoon, resolveShopOpensAt, shopLockedFor } from "./coming-soon";

// Estado do "Coming soon" para quem faz o request (memoizado por request). Admin = papel "admin"
// em role_assignments (o mesmo gate do portal /admin): ele vê e usa a loja normal.

export type ShopComingSoonState = {
  /** Modo ativo agora (vale para todos, inclusive admin). */
  comingSoon: boolean;
  /** Loja trancada para esta pessoa (modo ativo e não é admin). */
  locked: boolean;
  isAdmin: boolean;
  signedIn: boolean;
  opensAt: string;
  serverNow: number;
};

export const getShopComingSoonState = cache(async (): Promise<ShopComingSoonState> => {
  const serverNow = Date.now();
  const opensAt = resolveShopOpensAt();
  const comingSoon = isShopComingSoon(serverNow);
  const user = await getUser();
  // o papel só importa com o modo ativo (evita a consulta depois da abertura)
  const isAdmin = comingSoon && user ? await hasRole("admin") : false;
  return {
    comingSoon,
    locked: shopLockedFor({ comingSoon, isAdmin }),
    isAdmin,
    signedIn: Boolean(user),
    opensAt,
    serverNow,
  };
});

/** Guarda das server actions de compra e lance: true = barrar com "shop_coming_soon". */
export async function isShopLockedForViewer(): Promise<boolean> {
  return (await getShopComingSoonState()).locked;
}

/**
 * "Me avise quando abrir" já pedido? Reaproveita o opt-in existente notification_preferences.commerce_updates
 * (Perfil → Notificações), sem migração. Sem sessão ou sem linha: false.
 */
export async function hasShopLaunchOptIn(): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("notification_preferences").select("commerce_updates").eq("user_id", user.id).maybeSingle();
    return data?.commerce_updates === true;
  } catch {
    return false;
  }
}
