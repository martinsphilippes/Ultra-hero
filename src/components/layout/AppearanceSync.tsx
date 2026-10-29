"use client";

import { useEffect } from "react";
import { resolveTemplate, TEMPLATE_COOKIE } from "@/lib/theme/template";

// Outras abas abertas acompanham a escolha da Aparência na hora (evento "storage"), só trocando o
// atributo do <html>: nada recarrega, então formulários e rolagem dessas abas ficam como estão.
export function AppearanceSync() {
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== TEMPLATE_COOKIE) return;
      document.documentElement.setAttribute("data-template", resolveTemplate(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return null;
}
