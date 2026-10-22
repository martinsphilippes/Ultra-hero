"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ErrorState } from "@/components/ui";

// Erro ao carregar o catálogo: "Tentar de novo" refaz a renderização do servidor.
export function RecipeCatalogRetry() {
  const t = useTranslations("recipes.catalog.results");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <ErrorState
      title={t("errorTitle")}
      description={t("errorDescription")}
      onRetry={() => startTransition(() => router.refresh())}
      retrying={pending}
    />
  );
}
