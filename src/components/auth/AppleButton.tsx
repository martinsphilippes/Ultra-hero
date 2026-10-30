"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LOGIN_HOME, safeNext } from "@/lib/auth/safe-next";
import { onNativeMessage, postToNative } from "@/lib/native-app/client";
import { createClient } from "@/lib/supabase/client";
import { AuthAlert } from "./AuthAlert";

type AppleButtonProps = { next: string; size?: "md" | "lg" };

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="currentColor">
      <path d="M16.37 12.68c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.54 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.24 2.73 2.2 1.1-.05 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.41 1.2-2.47-.03-.01-2.3-.88-2.32-3.5zM14.2 6.21c.6-.73 1.01-1.75.9-2.76-.87.03-1.92.58-2.54 1.31-.56.64-1.05 1.67-.92 2.66.97.08 1.96-.49 2.56-1.21z" />
    </svg>
  );
}

// Sign in with Apple (só no app iOS das lojas): a casca faz o login nativo e devolve o token de
// identidade; a sessão nasce aqui, no cliente da WebView, que grava os cookies como no login comum.
// A Apple exige esta opção ao lado do Google (guideline 4.8); docs/decisions/app-nas-lojas.md.
export function AppleButton({ next, size = "md" }: AppleButtonProps) {
  const t = useTranslations("auth");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(
    () =>
      onNativeMessage(async (message) => {
        if (message.type !== "apple-result") return;
        if (!message.ok) {
          setStatus(message.reason === "canceled" ? "idle" : "error");
          return;
        }
        const { error } = await createClient().auth.signInWithIdToken({ provider: "apple", token: message.token, nonce: message.nonce });
        if (error) {
          setStatus("error");
          return;
        }
        window.location.assign(safeNext(next, LOGIN_HOME));
      }),
    [next],
  );

  const signIn = () => {
    setStatus("loading");
    if (!postToNative({ type: "apple-signin" })) setStatus("error");
  };

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="primary" size={size} block leadingIcon={<AppleIcon />} loading={status === "loading"} onClick={signIn}>
        {t("apple.button")}
      </Button>
      {status === "error" && <AuthAlert>{t("errors.oauth")}</AuthAlert>}
    </div>
  );
}
