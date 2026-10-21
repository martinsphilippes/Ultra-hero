import { Compass } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { daySeed } from "@/components/discover/explore/tiles";
import { InlineError } from "@/components/discover/InlineError";
import { Button, EmptyState } from "@/components/ui";
import { getLocale } from "@/i18n/server";
import { homeFeedPage, type HomeFeedPage } from "./fetch";
import { FeedList } from "./FeedList";
import { FeedPost } from "./FeedPost";

// Início = feed infinito, post a post, igual para todos (a personalização entra depois).
export async function HomeFeed() {
  const [t, locale] = await Promise.all([getTranslations("discover.home.feed"), getLocale()]);
  const seed = daySeed();

  let page: HomeFeedPage;
  try {
    page = await homeFeedPage(seed, 0);
  } catch {
    return <InlineError />;
  }

  if (page.items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface">
        <EmptyState
          icon={<Compass />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button asChild variant="secondary">
              <Link href="/explore">{t("emptyCta")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    // Remonta quando muda a semente (virada do dia) ou o idioma: os lotes antigos vieram com os anteriores.
    <FeedList key={`${seed}|${locale}`} seed={seed} nextOffset={page.nextOffset} hasMore={page.hasMore}>
      {page.items.map((post, index) => (
        <FeedPost key={post.id} post={post} priority={index === 0} />
      ))}
    </FeedList>
  );
}
