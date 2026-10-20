import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

// Grupo (app): experiência do consumidor com a casca completa.
export default function ConsumerLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
