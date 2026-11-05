"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Resposta imediata ao clique: uma barra fina no topo aparece no mesmo instante em que a pessoa toca num link do app
// e some quando a tela nova chega (muda o endereço). Sem isso, a tela antiga ficava parada até o servidor responder
// e o toque parecia não ter funcionado. Decorativa (aria-hidden); quem usa leitor de tela já é avisado pelo título.
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  // chegou a tela nova: completa a barra e esconde
  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    const hide = setTimeout(() => setState((s) => (s === "done" ? "idle" : s)), 250);
    return () => clearTimeout(hide);
  }, [pathname, searchParams]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // mesma tela (só âncora): não há carregamento
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setState("loading");
      if (safety.current) clearTimeout(safety.current);
      safety.current = setTimeout(() => setState("idle"), 12_000);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (safety.current) clearTimeout(safety.current);
    };
  }, []);

  return (
    <div aria-hidden="true" className="uh-nav-progress" data-state={state}>
      <span />
    </div>
  );
}
