"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { bumpNavDepth } from "@/lib/nav-history";

// Conta as telas visitadas nesta aba (ver lib/nav-history): o botão de voltar usa isso.
export function NavHistory() {
  const pathname = usePathname();
  useEffect(() => {
    bumpNavDepth();
  }, [pathname]);
  return null;
}
