import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { LiveHighlight } from "@/components/collectibles/LiveHighlight";
import { FeedSkeleton } from "@/components/discover/home/feed/FeedSkeleton";
import { HomeFeed } from "@/components/discover/home/feed/HomeFeed";
import { getFollowContext } from "@/lib/heroes/follow-context";
import { FEED_PARAM, FEED_TABS, feedHref, parseFeedParam, resolveFeedTab } from "@/lib/heroes/follows";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("discover.meta");
  return { title: t("home") };
}

// Início: feed infinito de posts dos heróis, um abaixo do outro, como no Instagram. No celular a capa
// vai de borda a borda; no computador o feed fica numa coluna central. Logado, "Seguindo | Todos"
// no topo (?feed=…); o padrão é "Seguindo" para quem segue ao menos um herói.
type Props = { searchParams: Promise<{ [FEED_PARAM]?: string | string[] }> };

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams;
  const [t, th, tf, follow] = await Promise.all([getTranslations("discover.common"), getTranslations("discover.home.feed"), getTranslations("follows.feed"), getFollowContext()]);
  const tab = resolveFeedTab({ param: parseFeedParam(params[FEED_PARAM]), followCount: follow.following.size, available: follow.available, signedIn: follow.signedIn });
  const showTabs = follow.available && follow.signedIn;

  return (
    <div className="-mx-gutter flex flex-col gap-8 md:mx-auto md:w-full md:max-w-[470px]">
      <h1 className="sr-only">{th("title")}</h1>
      {/* Colecionáveis ao vivo (0057): destaque pequeno no topo; sem item ao vivo, nada */}
      <Suspense fallback={null}>
        <LiveHighlight />
      </Suspense>
      {showTabs ? (
        // navegação de documento (<a>): trocar só a query na mesma rota pelo roteador abortava o payload
        <nav aria-label={tf("tabsLabel")} className="px-gutter md:px-0" data-testid="feed-tabs" data-tab={tab}>
          {/* abas finas: texto pequeno e um traço de acento sob a escolhida; alvo de toque de 44px */}
          <ul className="flex items-center justify-center gap-7 border-b border-border">
            {FEED_TABS.map((key) => {
              const active = tab === key;
              return (
                <li key={key}>
                  <a
                    href={feedHref(key)}
                    aria-current={active ? "page" : undefined}
                    data-testid={`feed-tab-${key}`}
                    className={cn(
                      "relative -mb-px flex min-h-11 min-w-16 items-center justify-center px-1 text-sm tracking-[0.01em] transition-colors duration-150",
                      "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                      "after:absolute after:inset-x-1 after:bottom-0 after:h-px after:rounded-full after:transition-colors",
                      active ? "font-medium text-fg after:bg-fg" : "text-fg-muted after:bg-transparent hover:text-fg",
                    )}
                  >
                    {tf(`tabs.${key}`)}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
      <Suspense key={tab} fallback={<FeedSkeleton />}>
        <HomeFeed tab={tab} follow={follow} />
      </Suspense>
      <p className="type-caption px-gutter text-fg-subtle md:px-0">{t("educationalNote")}</p>
    </div>
  );
}
