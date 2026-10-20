"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
import { Button, ErrorState } from "@/components/ui";

type Props = { error: Error & { digest?: string }; reset: () => void };

// Erro da página de lista pessoal.
export default function ListError({ error, reset }: Props) {
  const t = useTranslations("discover.explore.lists");
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
            <Link href="/explore?tab=listas">{t("backToLists")}</Link>
          </Button>
        }
      />
    </div>
  );
}
