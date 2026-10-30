"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { hasNativeBridge, onNativeMessage, postToNative } from "@/lib/native-app/client";
import { createClient } from "@/lib/supabase/client";
import { AuthAlert } from "./AuthAlert";

type GoogleButtonProps = { next: string; size?: "md" | "lg" };

function GoogleIcon() {
  // Glifo "G" monocromático genérico (sem logotipo de terceiros embutido).
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M12 12h8" />
    </svg>
  );
}

// Login com Google via OAuth (PKCE). Se o provedor não estiver habilitado, avisa sem redirecionar.
export function GoogleButton({ next, size = "md" }: GoogleButtonProps) {
  const t = useTranslations("auth");
  const [status, setStatus] = useState<"idle" | "loading" | "unavailable" | "error">("idle");

  // App das lojas: o login abre no navegador do sistema; se a pessoa cancelar, o botão volta.
  useEffect(() => {
    if (!hasNativeBridge()) return;
    return onNativeMessage((message) => {
      if (message.type === "oauth-result") setStatus(message.reason === "canceled" ? "idle" : "error");
    });
  }, []);

  const signIn = async () => {
    setStatus("loading");
    const supabase = createClient();
    // No app das lojas a volta passa por /auth/native, que devolve o código ao app (gchero://).
    const native = hasNativeBridge();
    const redirectTo = `${window.location.origin}/auth/${native ? "native" : "callback"}?next=${encodeURIComponent(next)}`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });

    if (error || !data?.url) {
      setStatus("unavailable");
      return;
    }

    // Pré-checagem: provedor desabilitado responde 400 em vez de redirecionar.
    try {
      const probe = await fetch(data.url, { method: "GET", redirect: "manual", credentials: "omit" });
      if (probe.status >= 400) {
        setStatus("unavailable");
        return;
      }
    } catch {
      // CORS/rede: segue o fluxo normal de redirecionamento.
    }

    if (native && postToNative({ type: "oauth", url: data.url })) return;
    window.location.assign(data.url);
  };

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="secondary" size={size} block leadingIcon={<GoogleIcon />} loading={status === "loading"} onClick={signIn}>
        {t("google.button")}
      </Button>
      {status === "unavailable" && <AuthAlert tone="info">{t("google.unavailable")}</AuthAlert>}
      {status === "error" && <AuthAlert>{t("errors.oauth")}</AuthAlert>}
    </div>
  );
}
