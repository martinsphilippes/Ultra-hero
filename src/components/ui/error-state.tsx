"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

type ErrorStateProps = {
  title?: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
  retryLabel?: ReactNode;
  retrying?: boolean;
  /** Código técnico (digest) exibido discretamente. */
  digest?: string;
  action?: ReactNode;
  className?: string;
};

// Estado de erro com botão "tentar novamente". Textos padrão vêm das traduções.
export function ErrorState({ title, description, onRetry, retryLabel, retrying, digest, action, className }: ErrorStateProps) {
  const t = useTranslations("errors");
  const tc = useTranslations("common.actions");

  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-4 px-6 py-14 text-center", className)}>
      <div aria-hidden="true" className="flex size-16 items-center justify-center rounded-2xl border border-danger/30 bg-danger-soft text-danger">
        <TriangleAlert className="size-7" />
      </div>
      <div className="flex max-w-prose flex-col gap-1">
        <h2 className="type-h3 text-fg">{title ?? t("generic.title")}</h2>
        <p className="type-body-sm text-fg-muted">{description ?? t("generic.description")}</p>
        {digest && <p className="type-caption mt-1 font-mono text-fg-subtle">{t("digest", { digest })}</p>}
      </div>
      {(onRetry || action) && (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {onRetry && (
            <Button variant="secondary" onClick={onRetry} loading={retrying} leadingIcon={<RefreshCw />}>
              {retryLabel ?? tc("retry")}
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
