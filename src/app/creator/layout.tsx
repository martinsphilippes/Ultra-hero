import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/session";

// /creator: exige papel creator (admin também passa). A casca fica com cada área (0087): a do herói em
// (hero)/layout.tsx (sem menu, "← Perfil") e o escritório em escritorio/layout.tsx (portal do creator,
// com barra lateral e menu no celular, como agência e marca).
export default async function CreatorRootLayout({ children }: { children: ReactNode }) {
  await requireRole("creator", "/creator");
  return children;
}
