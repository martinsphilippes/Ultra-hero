import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { hubHref, type HubLibrary } from "@/lib/catalog/creator-hub";
import { LIBRARY_ICON } from "./LibraryList";

type Props = { slug: string; libraries: HubLibrary[] };

// Bibliotecas do herói no formato dos destaques do Instagram: círculos com ícone e rótulo numa
// faixa que rola na horizontal. A contagem fica no nome acessível ("Receitas, 8 itens").
export async function LibraryHighlights({ slug, libraries }: Props) {
  const t = await getTranslations("discover.personalities.libraries");
  return (
    <ul className="-mx-gutter flex gap-4 overflow-x-auto px-gutter pb-1 scrollbar-none md:mx-0 md:px-0" data-testid="hero-libraries">
      {libraries.map((library) => {
        const Icon = LIBRARY_ICON[library.key];
        return (
          <li key={library.key} className="shrink-0">
            <Link
              href={hubHref(slug, library.key)}
              data-library={library.key}
              className="group flex w-[4.5rem] flex-col items-center gap-1.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-full border border-border-strong bg-surface p-1 transition-colors group-hover:border-fg-muted">
                <span className="flex size-full items-center justify-center rounded-full bg-surface-elevated text-fg">
                  <Icon className="size-6" />
                </span>
              </span>
              <span className="w-full truncate text-center text-xs font-medium text-fg">{t(`labels.${library.key}`)}</span>
              <span className="sr-only">{t("count", { count: library.count })}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
