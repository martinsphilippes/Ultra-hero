"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
import { Button, ErrorState } from "@/components/ui";

type Props = { error: Error & { digest?: string }; reset: () => void };

// Limite de erro do grupo (app): cobre o Início e rotas sem error.tsx próprio.
export default function AppError({ error, reset }: Props) {
  const tc = useTranslations("common.actions");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <ErrorState
        onRetry={reset}
        digest={error.digest}
        action={
          <Button asChild variant="ghost">
            <Link href="/explore">{tc("search")}</Link>
          </Button>
        }
      />
    </div>
  );
}
