"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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

  const signIn = async () => {
    setStatus("loading");
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
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
