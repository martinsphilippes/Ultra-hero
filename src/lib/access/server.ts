import "server-only";
import { getNativeApp } from "@/lib/native-app/server";
import { isCreatorAppOnlyEnabled } from "./gate";

/**
 * Esta requisição pode criar/usar acesso de Hero? Hero/Creator só pelo aplicativo (0141): no navegador (fora da WebView
 * da casca das lojas) o cadastro e a área do Hero ficam fechados. Use antes de qualquer ação que dê ou use o perfil Hero.
 */
export async function heroChannelBlocked(): Promise<boolean> {
  if (!isCreatorAppOnlyEnabled()) return false;
  return (await getNativeApp()) === null;
}
