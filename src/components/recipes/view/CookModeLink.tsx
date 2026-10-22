"use client";

import { CookingPot } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buttonBase, buttonSizes, buttonVariants } from "@/components/ui";
import { cookModeHref } from "@/lib/recipes/cook-mode";
import { cn } from "@/lib/utils";

/** Botão "Modo Cozinha" com o destino já montado (também serve de fallback do Suspense). */
export function CookModeLinkView({ href }: { href: string }) {
  const t = useTranslations("kitchen.entry");
  return (
    <Link href={href} prefetch={false} className={cn(buttonBase, buttonVariants.primary, buttonSizes.md)} data-testid="recipe-cook-mode">
      <CookingPot className="size-4" aria-hidden="true" />
      {t("open")}
    </Link>
  );
}

// Entrada do Modo Cozinha (/content/[slug]/cozinha): leva as porções ajustadas na página
// (?porcoes=, mantido em sincronia pelo painel de ingredientes com o histórico do navegador).
export function CookModeLink({ slug }: { slug: string }) {
  const porcoes = useSearchParams().get("porcoes");
  return <CookModeLinkView href={cookModeHref(slug, porcoes)} />;
}
