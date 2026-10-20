"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

type ErrorPageProps = { error: Error & { digest?: string }; reset: () => void };

// Limite de erro da árvore (abaixo do layout raiz, então os provedores existem).
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const tc = useTranslations("common.actions");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="flex min-h-[60dvh] items-center justify-center px-gutter py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-lg">
        <ErrorState
          onRetry={reset}
          digest={error.digest}
          action={
            <Button asChild variant="ghost">
              <Link href="/">{tc("goHome")}</Link>
            </Button>
          }
        />
      </div>
    </main>
  );
}
