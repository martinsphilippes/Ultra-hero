"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
import { Button, ErrorState } from "@/components/ui";

type Props = { error: Error & { digest?: string }; reset: () => void; backHref?: string; backLabel?: string };

// Corpo padrão dos error.tsx das páginas de operação do admin.
export function AdminOpsError({ error, reset, backHref = "/admin", backLabel }: Props) {
  const t = useTranslations("nav.admin");
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
            <Link href={backHref}>{backLabel ?? t("dashboard")}</Link>
          </Button>
        }
      />
    </div>
  );
}
