import type { ProfessionalTap } from "@/lib/professionals/rules";

// Toque em "Contratar"/"Ver perfil" (0058): manda para /api/professional-taps sem esperar
// (sendBeacon sobrevive à navegação). Um toque por profissional, origem e ação a cada página aberta;
// nada da pessoa vai junto.
const sent = new Set<string>();

export function fireProfessionalTap(tap: ProfessionalTap | null | undefined): void {
  if (!tap || typeof window === "undefined") return;
  const key = `${tap.professionalId}:${tap.creatorId ?? ""}:${tap.source}:${tap.action}:${window.location.pathname}`;
  if (sent.has(key)) return;
  sent.add(key);
  try {
    const body = JSON.stringify(tap);
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/professional-taps", blob)) return;
    void fetch("/api/professional-taps", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  } catch {
    // nunca atrapalha o toque
  }
}
