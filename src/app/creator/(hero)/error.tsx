"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
import { Button, ErrorState } from "@/components/ui";

type Props = { error: Error & { digest?: string }; reset: () => void };

// Erro das páginas do portal da personalidade (dentro da casca do portal).
export default function CreatorError({ error, reset }: Props) {
  const t = useTranslations("nav");
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
            <Link href="/creator">{t("creator.dashboard")}</Link>
          </Button>
        }
      />
    </div>
  );
}
