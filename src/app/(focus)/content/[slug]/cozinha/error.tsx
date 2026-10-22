"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
import { Button, ErrorState } from "@/components/ui";

type Props = { error: Error & { digest?: string }; reset: () => void };

// Erro do Modo Cozinha (fora da casca do app): tenta de novo ou volta ao Explorar.
export default function CookModeError({ error, reset }: Props) {
  const tc = useTranslations("common.actions");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-2xl items-center px-gutter py-6">
      <div className="w-full rounded-2xl border border-border bg-surface">
        <ErrorState
          onRetry={reset}
          digest={error.digest}
          action={
            <Button asChild variant="ghost">
              <Link href="/explore">{tc("goHome")}</Link>
            </Button>
          }
        />
      </div>
    </main>
  );
}
