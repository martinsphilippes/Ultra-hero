"use client";

import { useEffect } from "react";
import { hasNativeBridge } from "@/lib/native-app/client";
import { unregisterServiceWorkers } from "@/components/pwa/ServiceWorkerRegister";

// Mensagem "só pelo aplicativo" aberta DENTRO do app (0141): foi uma navegação sem a marca do app (no Android, refeita pelo
// service worker antigo). Remove o service worker e volta ao Portal do Hero; a próxima navegação já sai com a marca.
export function NativeAppRecover({ to = "/heroi" }: { to?: string }) {
  useEffect(() => {
    if (!hasNativeBridge()) return;
    // uma tentativa por sessão: se voltar para cá de novo, a mensagem fica (nunca entra em laço)
    try {
      if (sessionStorage.getItem("uh-native-recover") === "1") return;
      sessionStorage.setItem("uh-native-recover", "1");
    } catch {
      return;
    }
    let cancelled = false;
    void unregisterServiceWorkers().then(() => {
      if (!cancelled) window.location.replace(to);
    });
    return () => {
      cancelled = true;
    };
  }, [to]);
  return null;
}
