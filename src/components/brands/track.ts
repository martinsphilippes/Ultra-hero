import type { BrandClick } from "@/lib/brands";

// Clique para fora (marca ou produto) → /api/brand-clicks, sem esperar (sendBeacon). Nada da pessoa
// vai junto; o servidor soma por dia, alvo e origem (0062). Nunca atrapalha a navegação.
export function trackBrandClick(click: BrandClick): void {
  try {
    const body = JSON.stringify(click);
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/brand-clicks", blob)) return;
    void fetch("/api/brand-clicks", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  } catch {
    // contador nunca quebra a experiência
  }
}
