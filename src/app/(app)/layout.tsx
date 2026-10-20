import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { TimezoneSync } from "@/components/me/TimezoneSync";
import { getProfile } from "@/lib/auth/session";

// Grupo (app): experiência do consumidor com a casca completa.
// TimezoneSync (só com sessão) alinha profiles.timezone ao fuso do dispositivo.
export default async function ConsumerLayout({ children }: { children: ReactNode }) {
  const profile = await getProfile();
  return (
    <AppShell>
      {children}
      {profile ? <TimezoneSync timezone={profile.timezone} /> : null}
    </AppShell>
  );
}
