import type { ReactNode } from "react";

// Grupo (focus): telas de uso com as mãos ocupadas (Modo Cozinha), sem a barra superior nem a barra
// inferior do app. Cada página traz o próprio <main> e o caminho de volta.
export default function FocusLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-bg">{children}</div>;
}
