"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
import { Button, ErrorState } from "@/components/ui";

type Props = { error: Error & { digest?: string }; reset: () => void; backHref: string };

// Conteúdo do error.tsx das rotas administrativas: tentar de novo + voltar à lista.
export function AdminError({ error, reset, backHref }: Props) {
  const t = useTranslations("adminContent.common");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <ErrorState
        description={t("error")}
        onRetry={reset}
        retryLabel={t("retry")}
        digest={error.digest}
        action={
          <Button asChild variant="ghost">
            <Link href={backHref}>{t("backToList")}</Link>
          </Button>
        }
      />
    </div>
  );
}
