"use client";

import { CookingPot } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import { cookModeHref } from "@/lib/recipes/cook-mode";

/** Botão "Modo Cozinha" com o destino já montado. */
export function CookModeLinkView({ href }: { href: string }) {
  const t = useTranslations("kitchen.entry");
  return (
    <Button asChild variant="primary" size="lg" leadingIcon={<CookingPot />} className="w-full sm:w-auto">
      <Link href={href} data-testid="cook-mode-link" prefetch={false}>
        {t("open")}
      </Link>
    </Button>
  );
}

// Leva o ajuste de porções da página (?porcoes=) para o Modo Cozinha.
export function CookModeLink({ slug }: { slug: string }) {
  const params = useSearchParams();
  return <CookModeLinkView href={cookModeHref(slug, params.get("porcoes"))} />;
}
