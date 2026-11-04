import { getTranslations } from "next-intl/server";
import type { CulturePortal } from "@/lib/culture/links";
import type { AgendaPost } from "@/lib/editorial/vocab";
import { PostCard } from "./PostCard";

/** Notícias e dicas ligadas ao evento (0101), no detalhe do evento dos portais. Some quando não há nenhuma. */
export async function EventPosts({ posts, portal }: { posts: AgendaPost[]; portal: CulturePortal }) {
  if (posts.length === 0) return null;
  const t = await getTranslations("culture.posts");
  return (
    <section className="flex flex-col gap-2" aria-labelledby="event-posts-title" data-testid="event-posts">
      <h2 id="event-posts-title" className="text-sm font-semibold text-fg">
        {t("eventTitle")}
      </h2>
      <ul className="grid gap-2">
        {posts.map((p) => (
          <PostCard key={p.id} post={p} portal={portal} />
        ))}
      </ul>
    </section>
  );
}
