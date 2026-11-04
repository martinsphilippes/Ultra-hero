import { getLocale, getTranslations } from "next-intl/server";
import { eventWhen } from "@/components/platform-calendar/PlatformEventView";
import { PageHeader } from "@/components/ui";
import { defaultTimeZone, type Locale } from "@/i18n/config";
import { getPlatformEvent } from "@/lib/platform-calendar/queries";
import { localParts } from "@/lib/sponsorship/vocab";
import type { AgendaPost } from "@/lib/editorial/vocab";
import { PostForm, type PostFormValues } from "./PostForm";

type Props = {
  scope: "platform" | "agency";
  base: string;
  /** Editando: a notícia/dica. Nova: null. */
  post: AgendaPost | null;
  /** Nova a partir de um evento (?evento=). */
  eventId?: string | null;
};

// Editor de notícia/dica (0101), igual no admin (Groscove) e na agência. Nova pode vir já ligada a um evento.
export async function PostEditorPage({ scope, base, post, eventId = null }: Props) {
  const [t, locale] = await Promise.all([getTranslations("culture.editorial"), getLocale() as Promise<Locale>]);
  const linkedId = post?.eventId ?? eventId;
  const linked = linkedId ? await getPlatformEvent(linkedId) : null;
  const usable = linked && linked.status !== "draft" ? linked : null;
  const when = post?.publishedAt && post.status === "scheduled" ? localParts(post.publishedAt, defaultTimeZone) : null;
  const initial: PostFormValues = {
    id: post?.id ?? null,
    kind: post?.kind ?? "news",
    title: post?.title ?? (usable ? usable.title.slice(0, 140) : ""),
    body: post?.body ?? "",
    imageUrl: post?.imageUrl ?? "",
    linkUrl: post?.linkUrl ?? "",
    eventId: usable?.id ?? "",
    status: post?.status ?? "draft",
    publishDate: when?.date ?? "",
    publishTime: when?.time ?? "09:00",
  };
  return (
    <div className="flex flex-col gap-5" data-testid="post-editor">
      <PageHeader title={post ? t("edit") : t("new")} backHref={base} backLabel={t("back")} />
      <PostForm scope={scope} initial={initial} initialEvent={usable ? { id: usable.id, title: usable.title, when: eventWhen(usable, locale) } : null} backHref={base} />
    </div>
  );
}
