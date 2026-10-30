import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { hubHref } from "@/lib/catalog/creator-hub";
import type { LibraryTile } from "@/lib/heroes/library-tabs";
import { cn } from "@/lib/utils";
import { LIBRARY_ICONS } from "./library-icons";

type Props = { slug: string; tiles: LibraryTile[] };

// Atalhos do herói no formato dos destaques do Instagram: círculos com ícone e rótulo numa faixa
// que rola na horizontal. Rótulo, ícone e ordem vêm da configuração do admin (0050); a contagem
// fica no nome acessível ("Alimentação, 8 itens").
export async function LibraryHighlights({ slug, tiles }: Props) {
  const t = await getTranslations("discover.personalities.libraries");
  return (
    <ul className="-mx-gutter flex gap-4 overflow-x-auto px-gutter pb-1 scrollbar-none md:mx-0 md:px-0" data-testid="hero-libraries">
      {tiles.map((tile) => {
        const Icon = LIBRARY_ICONS[tile.icon];
        // produtos não existem no app das lojas (docs/decisions/app-nas-lojas.md)
        return (
          <li key={tile.key} className={cn("shrink-0", tile.key === "produtos" && "native:hidden")}>
            <Link
              href={hubHref(slug, tile.key)}
              data-library={tile.key}
              data-icon={tile.icon}
              className="group flex w-[4.5rem] flex-col items-center gap-1.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-full border border-border-strong bg-surface p-1 transition-colors group-hover:border-fg-muted">
                <span className="flex size-full items-center justify-center rounded-full bg-surface-elevated text-fg">
                  <Icon className="size-6" />
                </span>
              </span>
              <span className="w-full truncate text-center text-xs font-medium text-fg">{tile.label ?? t(`labels.${tile.key}`)}</span>
              <span className="sr-only">{t("count", { count: tile.count })}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
