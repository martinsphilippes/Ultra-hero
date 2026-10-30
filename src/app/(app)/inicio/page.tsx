import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { DemoAccess } from "@/components/demo/DemoAccess";
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
type Props = { searchParams: Promise<{ demo?: string; [FEED_PARAM]?: string | string[] }> };

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams;
  const [t, th, tf, follow] = await Promise.all([getTranslations("discover.common"), getTranslations("discover.home.feed"), getTranslations("follows.feed"), getFollowContext()]);
  const tab = resolveFeedTab({ param: parseFeedParam(params[FEED_PARAM]), followCount: follow.following.size, available: follow.available, signedIn: follow.signedIn });
  const showTabs = follow.available && follow.signedIn;

  return (
    <div className="-mx-gutter flex flex-col gap-8 md:mx-auto md:w-full md:max-w-[470px]">
      <h1 className="sr-only">{th("title")}</h1>
      <DemoAccess from="home" failed={params.demo === "error"} />
      {showTabs ? (
        // navegação de documento (<a>): trocar só a query na mesma rota pelo roteador abortava o payload
        <nav aria-label={tf("tabsLabel")} className="px-gutter md:px-0" data-testid="feed-tabs" data-tab={tab}>
          <ul className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-elevated p-1">
            {FEED_TABS.map((key) => (
              <li key={key}>
                <a
                  href={feedHref(key)}
                  aria-current={tab === key ? "page" : undefined}
                  data-testid={`feed-tab-${key}`}
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                    tab === key ? "bg-accent text-accent-fg shadow-sm" : "text-fg-muted hover:bg-surface-hover hover:text-fg",
                  )}
                >
                  {tf(`tabs.${key}`)}
                </a>
              </li>
            ))}
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
