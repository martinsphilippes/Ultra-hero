"use client";

import { Printer, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { trackRecipeEvent } from "@/app/(app)/content/recipe-actions";
import { Button, useToast } from "@/components/ui";

type Props = {
  title: string;
  /** Caminho da receita (/content/slug); o endereço completo vem do navegador, com as porções. */
  path: string;
  /** Imprimir só faz sentido com a receita aberta (ingredientes e preparo). */
  canPrint: boolean;
};

// Compartilhar (Web Share API; sem ela, copia o link) e imprimir (o CSS de impressão esconde a casca
// do app e mantém ingredientes já ajustados às porções e o preparo).
export function RecipeShareButtons({ title, path, canPrint }: Props) {
  const t = useTranslations("recipes.page");
  const { toast } = useToast();
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  async function share() {
    // mantém ?porcoes= quando a pessoa ajustou; o resto da URL atual não vai junto
    const current = new URL(window.location.href);
    const url = new URL(path, window.location.origin);
    const servings = current.searchParams.get("porcoes");
    if (servings) url.searchParams.set("porcoes", servings);
    const href = url.toString();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url: href });
        void trackRecipeEvent({ event: "recipe.share", method: "native" });
        return;
      } catch (error) {
        // a pessoa fechou a folha de compartilhar: nada a fazer
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(href);
      toast({ title: t("linkCopied"), variant: "success" });
      void trackRecipeEvent({ event: "recipe.share", method: "copy" });
    } catch {
      // sem área de transferência (http, permissão negada): mostra o link para copiar à mão
      setFallbackUrl(href);
    }
  }

  function print() {
    void trackRecipeEvent({ event: "recipe.print" });
    window.print();
  }

  return (
    <>
      <Button variant="secondary" leadingIcon={<Share2 />} onClick={share} data-testid="recipe-share">
        {t("share")}
      </Button>
      {canPrint ? (
        <Button variant="secondary" leadingIcon={<Printer />} onClick={print} data-testid="recipe-print">
          {t("print")}
        </Button>
      ) : null}
      {fallbackUrl ? (
        <label className="flex w-full flex-col gap-1 text-sm text-fg">
          {t("copyManually")}
          <input
            readOnly
            value={fallbackUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            data-testid="recipe-share-fallback"
          />
        </label>
      ) : null}
    </>
  );
}
