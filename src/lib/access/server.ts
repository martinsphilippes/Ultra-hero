import "server-only";
import { getNativeApp } from "@/lib/native-app/server";
import { isCreatorAppOnlyEnabled } from "./gate";

/**
 * Esta requisição pode criar/usar acesso de Hero? Com a regra "Hero só pelo aplicativo" ligada (CREATOR_APP_ONLY=true,
 * 0141), no navegador (fora da WebView da casca das lojas) o cadastro e a área do Hero ficam fechados. Desligada (padrão
 * desde 17/11/2026), nunca bloqueia. Use antes de qualquer ação que dê ou use o perfil Hero.
 */
export async function heroChannelBlocked(): Promise<boolean> {
  if (!isCreatorAppOnlyEnabled()) return false;
  return (await getNativeApp()) === null;
}
