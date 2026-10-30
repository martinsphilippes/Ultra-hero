"use client";

import { useEffect } from "react";
import { registerPushToken } from "@/app/(app)/push-actions";
import { requestNativePush } from "@/lib/native-app/client";

// App das lojas, pessoa logada: se o sistema já deu a permissão, renova o token deste aparelho na
// conta (o token muda com reinstalação, e o mesmo aparelho pode trocar de conta). Nunca pede
// permissão: isso só acontece no contexto (favoritar herói, tela de avisos). Sem app, não faz nada.
export function PushRegistrar() {
  useEffect(() => {
    let active = true;
    requestNativePush(false).then((result) => {
      if (active && result.ok) void registerPushToken({ token: result.token });
    });
    return () => {
      active = false;
    };
  }, []);
  return null;
}
