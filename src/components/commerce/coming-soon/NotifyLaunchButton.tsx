"use client";

import { Bell, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { notifyShopLaunch } from "@/app/(app)/shop/coming-soon-actions";

const STORAGE_KEY = "uh-shop-launch-notify";

type Props = { signedIn: boolean; initialOptedIn: boolean; nextPath: string };

// "Me avise quando abrir": logado grava o opt-in (server action); deslogado vai para entrar/criar conta e
// volta para cá. O localStorage só lembra o "Pronto!" neste aparelho (o registro de verdade é no servidor).
export function NotifyLaunchButton({ signedIn, initialOptedIn, nextPath }: Props) {
  const t = useTranslations("commerce.comingSoon");
  const [done, setDone] = useState(initialOptedIn);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!signedIn || initialOptedIn) return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") setDone(true);
    } catch {
      // armazenamento bloqueado: segue sem lembrar
    }
  }, [signedIn, initialOptedIn]);

  if (!signedIn) {
    const next = encodeURIComponent(nextPath);
    return (
      <div className="flex w-full flex-col items-center gap-2">
        <Link href={`/login?next=${next}`} className="uh-cs-cta" data-testid="shop-coming-soon-login">
          <Bell className="size-4" aria-hidden="true" />
          {t("notify")}
        </Link>
        {/* /login é também o cadastro rápido (o /signup redireciona para lá) */}
        <p className="text-xs text-[var(--cs-sand-muted)]">{t("loginHint")}</p>
      </div>
    );
  }

  if (done) {
    return (
      <p role="status" className="uh-cs-done" data-testid="shop-coming-soon-notified">
        <Check className="size-4" aria-hidden="true" />
        {t("notified")}
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <button
        type="button"
        className="uh-cs-cta"
        disabled={pending}
        aria-busy={pending || undefined}
        data-testid="shop-coming-soon-notify"
        onClick={() =>
          startTransition(async () => {
            setError(false);
            const result = await notifyShopLaunch();
            if (!result.ok) {
              setError(true);
              return;
            }
            try {
              window.localStorage.setItem(STORAGE_KEY, "1");
            } catch {
              // sem armazenamento: o servidor já guardou
            }
            setDone(true);
          })
        }
      >
        <Bell className="size-4" aria-hidden="true" />
        {t("notify")}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-[var(--cs-orange-soft)]">
          {t("notifyError")}
        </p>
      ) : null}
    </div>
  );
}
