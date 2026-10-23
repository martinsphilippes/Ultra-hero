import "server-only";
import { isValidTimeZone } from "@/components/me/dates";
import { getProfile, getRoles, requireUser } from "@/lib/auth/session";
import { resolveTodayView } from "@/lib/health/view";
import type { WatchView } from "@/lib/wearables/context";

// Visão do Hoje para as páginas em /profile/today: conta demo vê o próprio relógio simulado; conta
// real vê o "Exemplo" só quando pede (?exemplo=1) e, com WEARABLES_REAL_ENABLED=1, o relógio que
// conectou (lido do schema health pelas RPCs do dono). Com a chave desligada nada é lido.
export async function loadWatchView(next: string, wantsExample: boolean): Promise<WatchView> {
  const user = await requireUser(next);
  const [profile, roles] = await Promise.all([getProfile(), getRoles()]);
  const tz = isValidTimeZone(profile?.timezone) ? profile.timezone : "UTC";
  return resolveTodayView({ user, roles: roles.map((r) => r.role), timeZone: tz, example: wantsExample });
}

export function wantsExample(value: string | string[] | undefined): boolean {
  return value === "1" || (Array.isArray(value) && value.includes("1"));
}
