import type { ReactNode } from "react";
import { OutbidAlerts } from "@/components/collectibles/OutbidAlerts";
import { AppShell } from "@/components/layout/AppShell";
import { TimezoneSync } from "@/components/me/TimezoneSync";
import { getProfile } from "@/lib/auth/session";

// Grupo (app): experiência do consumidor com a casca completa.
// TimezoneSync (só com sessão) alinha profiles.timezone ao fuso do dispositivo.
// OutbidAlerts (só com sessão, web e app): pop-up de lance superado nos Colecionáveis (0061). No app
// das lojas /shop/colecionaveis é liberado (só lances, sem pagamento).
export default async function ConsumerLayout({ children }: { children: ReactNode }) {
  const profile = await getProfile();
  return (
    <AppShell>
      {children}
      {profile ? <TimezoneSync timezone={profile.timezone} /> : null}
      {profile ? <OutbidAlerts userId={profile.id} /> : null}
    </AppShell>
  );
}
