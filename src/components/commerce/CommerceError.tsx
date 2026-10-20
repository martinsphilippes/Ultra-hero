"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
import { Button, ErrorState } from "@/components/ui";

type Props = { error: Error & { digest?: string }; reset: () => void };

// Limite de erro compartilhado pelas rotas do comércio demonstrativo (dentro da casca do app).
export function CommerceError({ error, reset }: Props) {
  const t = useTranslations("commerce.shop");
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
            <Link href="/shop">{t("title")}</Link>
          </Button>
        }
      />
    </div>
  );
}
