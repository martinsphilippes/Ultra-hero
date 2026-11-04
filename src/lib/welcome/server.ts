import "server-only";
import { cookies } from "next/headers";
import { getUser } from "@/lib/auth/session";
import { INTRO_E2E_COOKIE } from "@/lib/intro/script";
import { hasSeenWelcome, type WelcomeArea } from "./areas";

export type WelcomeState = { mounted: boolean; initialOpen: boolean };

/** Monta o card da área? (só com sessão) E abre sozinho? (ainda não visto; nunca nos navegadores de E2E). */
export async function getWelcomeState(area: WelcomeArea): Promise<WelcomeState> {
  const user = await getUser();
  if (!user) return { mounted: false, initialOpen: false };
  const e2e = (await cookies()).get(INTRO_E2E_COOKIE) !== undefined;
  return { mounted: true, initialOpen: !e2e && !hasSeenWelcome(user.user_metadata, area) };
}
