"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
import { Button, ErrorState } from "@/components/ui";

type Props = { error: Error & { digest?: string }; reset: () => void };

// Erro das páginas de personalidades (lista e perfil).
export default function PersonalitiesError({ error, reset }: Props) {
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
            <Link href="/">{tc("goHome")}</Link>
          </Button>
        }
      />
    </div>
  );
}
