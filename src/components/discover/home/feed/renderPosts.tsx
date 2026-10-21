import "server-only";
import { FeedPost } from "./FeedPost";
import type { FeedPostData } from "./posts";

// Renderiza posts no servidor para a ação "carregar mais" do feed (o cliente só anexa os nós).
export function renderFeedPosts(items: FeedPostData[]) {
  return (
    <>
      {items.map((post) => (
        <FeedPost key={post.id} post={post} />
      ))}
    </>
  );
}
