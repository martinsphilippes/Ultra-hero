"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

// Erro compacto de seção com "tentar novamente" (refaz a renderização do servidor).
export function InlineError({ message, className }: { message?: string; className?: string }) {
  const t = useTranslations("discover.common");
  const tc = useTranslations("common.actions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="flex items-center gap-2 text-sm text-fg">
        <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden="true" />
        {message ?? t("sectionError")}
      </p>
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        leadingIcon={<RefreshCw />}
        onClick={() => startTransition(() => router.refresh())}
      >
        {tc("retry")}
      </Button>
    </div>
  );
}
