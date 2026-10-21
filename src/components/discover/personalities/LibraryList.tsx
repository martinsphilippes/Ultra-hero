import { Apple, ChefHat, ChevronRight, Dumbbell, Layers, ShoppingBag, Sunrise, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { hubHref, type HubLibrary } from "@/lib/catalog/creator-hub";
import type { LibraryKey } from "@/lib/catalog/creator-libraries";
import { cn } from "@/lib/utils";

/** Ícone de cada biblioteca do hub (lucide). */
export const LIBRARY_ICON: Record<LibraryKey, LucideIcon> = {
  rotina: Sunrise,
  nutricao: Apple,
  receitas: ChefHat,
  treinos: Dumbbell,
  gastronomia: UtensilsCrossed,
  programas: Layers,
  produtos: ShoppingBag,
};

type Props = { slug: string; libraries: HubLibrary[]; className?: string };

// Lista editorial de botões em largura total: ícone, rótulo, contagem (DM Mono) e chevron.
// O nome acessível do link é o rótulo + contagem; ícone e chevron são decorativos.
export async function LibraryList({ slug, libraries, className }: Props) {
  const t = await getTranslations("discover.personalities.libraries");
  return (
    <ul className={cn("divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm", className)} data-testid="hero-libraries">
      {libraries.map((library) => {
        const Icon = LIBRARY_ICON[library.key];
        return (
          <li key={library.key}>
            <Link
              href={hubHref(slug, library.key)}
              data-library={library.key}
              className={cn(
                "group flex min-h-16 items-center gap-4 px-4 py-3 text-fg transition-colors duration-200 ease-out-expo",
                "hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
              )}
            >
              <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-elevated text-accent-text">
                <Icon className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="type-h3 truncate">{t(`labels.${library.key}`)}</span>
                <span className="type-overline text-fg-muted">{t("count", { count: library.count })}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-fg-muted transition-transform duration-200 ease-out-expo group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
