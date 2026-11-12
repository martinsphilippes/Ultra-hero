"use client";

import { useEffect } from "react";
import { hasNativeBridge } from "@/lib/native-app/client";

/** Dentro do app das lojas? (ponte da casca ou a marca no user agent) */
function insideNativeApp(): boolean {
  return hasNativeBridge() || (typeof navigator !== "undefined" && /\bGCHeroApp\//.test(navigator.userAgent));
}

/** Remove os service workers já instalados (no app eles refazem as navegações sem a marca do app no Android — 0141). */
export async function unregisterServiceWorkers(): Promise<number> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return 0;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
    return registrations.length;
  } catch {
    return 0;
  }
}

// Registra o service worker só em produção (em dev atrapalha o HMR e o cache) e só no navegador: dentro do app das lojas
// ele não é registrado (e o antigo é removido), para toda navegação sair da WebView com a marca do app (0141).
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (insideNativeApp()) {
      void unregisterServiceWorkers();
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Sem SW o app continua funcionando normalmente.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
