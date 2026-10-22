"use client";

import { CookingPot } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buttonBase, buttonSizes, buttonVariants } from "@/components/ui";
import { parseServingsParam } from "@/lib/recipes/scale";
import { cn } from "@/lib/utils";

// Entrada do Modo Cozinha (/content/[slug]/cozinha, fase 4): leva as porções ajustadas na página
// (?porcoes=, mantido em sincronia pelo ServingsScaler com o histórico do navegador).
export function CookModeLink({ path }: { path: string }) {
  const t = useTranslations("recipes.page");
  const servings = parseServingsParam(useSearchParams().get("porcoes"));
  const href = servings ? `${path}/cozinha?porcoes=${servings}` : `${path}/cozinha`;
  return (
    <Link href={href} prefetch={false} className={cn(buttonBase, buttonVariants.primary, buttonSizes.md)} data-testid="recipe-cook-mode">
      <CookingPot className="size-4" aria-hidden="true" />
      {t("cookMode")}
    </Link>
  );
}
