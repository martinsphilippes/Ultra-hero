import "server-only";
import type { FollowContext } from "@/lib/heroes/follow-context";
import type { FeedFollow } from "./FeedPost";

/** Props do botão Seguir nos posts; sem hero_favorites no banco, sem botão. */
export function feedFollowProps(follow: FollowContext): FeedFollow | undefined {
  // /inicio sem a aba: depois do login, quem já segue alguém cai no "Seguindo"
  return follow.available ? { signedIn: follow.signedIn, following: follow.following, pushReady: follow.pushReady, path: "/inicio" } : undefined;
}
