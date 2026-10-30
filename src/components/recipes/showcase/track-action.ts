import type { RecipeActionKey, RecipeActionTrack } from "@/lib/recipes/showcase";

// Toque numa ação da receita (0051): manda para /api/recipe-actions sem esperar (sendBeacon sobrevive
// à navegação). Um toque por ação e receita a cada página aberta; nada da pessoa vai junto.
const sent = new Set<string>();

export function fireRecipeAction(track: RecipeActionTrack | null | undefined, action: RecipeActionKey): void {
  if (!track || typeof window === "undefined") return;
  const key = `${track.creatorId}:${track.contentId}:${track.source}:${action}:${window.location.pathname}`;
  if (sent.has(key)) return;
  sent.add(key);
  try {
    const body = JSON.stringify({ ...track, action });
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/recipe-actions", blob)) return;
    void fetch("/api/recipe-actions", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  } catch {
    // nunca atrapalha o toque
  }
}
