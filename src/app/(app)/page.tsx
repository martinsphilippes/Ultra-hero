import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { DemoAccess } from "@/components/demo/DemoAccess";
import { FeedSkeleton } from "@/components/discover/home/feed/FeedSkeleton";
import { HomeFeed } from "@/components/discover/home/feed/HomeFeed";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("discover.meta");
  return { title: t("home") };
}

// Início: feed infinito de posts dos heróis, um abaixo do outro, como no Instagram. No celular a capa
// vai de borda a borda; no computador o feed fica numa coluna central.
type Props = { searchParams: Promise<{ demo?: string }> };

export default async function HomePage({ searchParams }: Props) {
  const { demo } = await searchParams;
  const [t, th] = await Promise.all([getTranslations("discover.common"), getTranslations("discover.home.feed")]);

  return (
    <div className="-mx-gutter flex flex-col gap-8 md:mx-auto md:w-full md:max-w-[470px]">
      <h1 className="sr-only">{th("title")}</h1>
      <DemoAccess failed={demo === "error"} />
      <Suspense fallback={<FeedSkeleton />}>
        <HomeFeed />
      </Suspense>
      <p className="type-caption px-gutter text-fg-subtle md:px-0">{t("educationalNote")}</p>
    </div>
  );
}
