import { Compass, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { daySeed } from "@/components/discover/explore/tiles";
import { InlineError } from "@/components/discover/InlineError";
import { Button, EmptyState } from "@/components/ui";
import { getLocale } from "@/i18n/server";
import type { FollowContext } from "@/lib/heroes/follow-context";
import { feedHref, type FeedTab } from "@/lib/heroes/follows";
import { feedFollowProps } from "./follow";
import { followingFeedPage, homeFeedPage, type HomeFeedPage } from "./fetch";
import { FeedList } from "./FeedList";
import { FeedPost } from "./FeedPost";

type Props = { tab: FeedTab; follow: FollowContext };

// Início = feed infinito, post a post. "Todos": a ordem do Explorar (igual para todos); "Seguindo":
// só os heróis que a pessoa segue, do mais recente ao mais antigo.
export async function HomeFeed({ tab, follow }: Props) {
  const [t, tf, locale] = await Promise.all([getTranslations("discover.home.feed"), getTranslations("follows.feed"), getLocale()]);
  const seed = daySeed();
  const following = tab === "seguindo" && follow.available;

  let page: HomeFeedPage;
  try {
    page = following ? await followingFeedPage([...follow.following], 0) : await homeFeedPage(seed, 0);
  } catch {
    return <InlineError />;
  }

  if (page.items.length === 0) {
    // "Seguindo" vazio: ninguém seguido (ou seguidos sem posts) — sugere a aba Hero e o "Todos"
    if (following) {
      return (
        <div className="mx-gutter rounded-2xl border border-border bg-surface md:mx-0" data-testid="feed-following-empty">
          <EmptyState
            icon={<Users />}
            title={follow.following.size === 0 ? tf("emptyNoneTitle") : tf("emptyNoPostsTitle")}
            description={follow.following.size === 0 ? tf("emptyNoneDescription") : tf("emptyNoPostsDescription")}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild variant="primary">
                  <Link href="/personalities">{tf("discoverHeroes")}</Link>
                </Button>
                <Button asChild variant="secondary">
                  <a href={feedHref("todos")}>{tf("seeAll")}</a>
                </Button>
              </div>
            }
          />
        </div>
      );
    }
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

  const followProps = feedFollowProps(follow);
  return (
    // Remonta quando muda a semente (virada do dia), o idioma ou a aba: os lotes antigos vieram com os anteriores.
    <FeedList key={`${seed}|${locale}|${tab}`} seed={seed} nextOffset={page.nextOffset} hasMore={page.hasMore} feed={following ? "seguindo" : "todos"}>
      {page.items.map((post, index) => (
        <FeedPost key={post.id} post={post} priority={index === 0} follow={followProps} />
      ))}
    </FeedList>
  );
}
