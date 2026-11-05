"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
import { Button, ErrorState } from "@/components/ui";
import { recoverFromStaleBuild } from "@/lib/stale-build";

type Props = { error: Error & { digest?: string }; reset: () => void };

// Erro das páginas do Portal do Hero (dentro da casca do portal).
export default function HeroPortalError({ error, reset }: Props) {
  const t = useTranslations("nav");
  useEffect(() => {
    console.error(error);
    // aba numa versão antiga do app depois de uma publicação: recarrega uma vez (src/lib/stale-build.ts)
    recoverFromStaleBuild(error);
  }, [error]);
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <ErrorState
        onRetry={reset}
        digest={error.digest}
        action={
          <Button asChild variant="ghost">
            <Link href="/heroi">{t("creator.home")}</Link>
          </Button>
        }
      />
    </div>
  );
}
