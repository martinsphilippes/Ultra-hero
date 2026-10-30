import type { ReactNode } from "react";
import { OutbidAlerts } from "@/components/collectibles/OutbidAlerts";
import { AppShell } from "@/components/layout/AppShell";
import { TimezoneSync } from "@/components/me/TimezoneSync";
import { getProfile } from "@/lib/auth/session";
import { getNativeApp } from "@/lib/native-app/server";

// Grupo (app): experiência do consumidor com a casca completa.
// TimezoneSync (só com sessão) alinha profiles.timezone ao fuso do dispositivo.
// OutbidAlerts (só com sessão, só na web): pop-up de lance superado nos Colecionáveis (0061). No app
// das lojas os Colecionáveis não existem (/shop bloqueado): lá o aviso chega só por push.
export default async function ConsumerLayout({ children }: { children: ReactNode }) {
  const [profile, nativeApp] = await Promise.all([getProfile(), getNativeApp()]);
  return (
    <AppShell>
      {children}
      {profile ? <TimezoneSync timezone={profile.timezone} /> : null}
      {profile && !nativeApp ? <OutbidAlerts userId={profile.id} /> : null}
    </AppShell>
  );
}
