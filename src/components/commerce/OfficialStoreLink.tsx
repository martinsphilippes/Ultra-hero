import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { VisuallyHidden } from "@/components/ui";
import { officialStoreUrl } from "@/lib/catalog/external-url";
import { cn } from "@/lib/utils";

type Props = { attributes: unknown; className?: string };

// Link secundário "Ver na loja oficial" (nova aba). Só renderiza com https válida em
// attributes.external_url; nunca substitui o carrinho de teste, que segue sendo a compra simulada.
export async function OfficialStoreLink({ attributes, className }: Props) {
  const href = officialStoreUrl(attributes);
  if (!href) return null;
  const t = await getTranslations("commerce.product");
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="official-store-link"
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        className,
      )}
    >
      <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
      {t("officialStore")}
      <VisuallyHidden> ({t("opensNewTab")})</VisuallyHidden>
    </a>
  );
}
