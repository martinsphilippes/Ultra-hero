import "server-only";
import { cache } from "react";
import { getRoles } from "@/lib/auth/session";
import { getNativeApp } from "@/lib/native-app/server";
import { buildPortalItems, forSurface, type SettingsItem } from "@/lib/settings/sections";
import { createClient } from "@/lib/supabase/server";
import { getTalentContext } from "@/lib/talent/server";

/** Portais que esta pessoa abre nesta superfície (web ou app das lojas). Sem sessão ou sem papel de portal: vazio. */
export const getMyPortalItems = cache(async (): Promise<SettingsItem[]> => {
  const roles = Array.from(new Set((await getRoles()).map((r) => r.role)));
  const [talent, platformAdmin, native] = await Promise.all([
    roles.includes("creator") ? getTalentContext() : null,
    // a conta de demonstração com papel admin não supervisiona agência e marca (os portais dizem "indisponível" a ela)
    roles.includes("admin") ? createClient().then((supabase) => supabase.rpc("is_platform_admin")) : null,
    getNativeApp(),
  ]);
  return forSurface(buildPortalItems(roles, undefined, { hasTalent: talent?.state === "ok", platformAdmin: platformAdmin?.data === true }), native !== null);
});
