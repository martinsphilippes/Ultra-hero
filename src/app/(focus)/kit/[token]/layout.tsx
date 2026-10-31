import type { Metadata } from "next";
import type { ReactNode } from "react";

// O segmento inteiro (inclusive a página de link indisponível) fica fora dos buscadores.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function KitLayout({ children }: { children: ReactNode }) {
  return children;
}
