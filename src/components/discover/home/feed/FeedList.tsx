"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { loadMoreFeed } from "@/app/(app)/feed-actions";
import { joinSentences } from "@/components/discover/explore/tiles";
import { Button, Spinner } from "@/components/ui";

type Props = {
  /** Semente da ordem (dia UTC), fixa durante a vida do componente: o pai remonta pela key quando muda. */
  seed: number;
  nextOffset: number;
  hasMore: boolean;
  /** Primeira página, já renderizada no servidor. */
  children: ReactNode;
};

type Batch = { id: number; nodes: ReactNode };

// Feed infinito do Início: ao se aproximar do fim, a próxima página chega já renderizada do servidor.
export function FeedList({ seed, nextOffset, hasMore, children }: Props) {
  const t = useTranslations("discover.home.feed");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [cursor, setCursor] = useState({ offset: nextOffset, hasMore });
  const [error, setError] = useState(false);
  const [announce, setAnnounce] = useState<{ id: number; text: string } | null>(null);
  const [observerSupported, setObserverSupported] = useState(true);
  const [pending, startTransition] = useTransition();
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (loadingRef.current || !cursor.hasMore) return;
    loadingRef.current = true;
    setError(false);
    startTransition(async () => {
      try {
        const result = await loadMoreFeed({ seed, offset: cursor.offset });
        if (!result.ok) {
          setError(true);
          return;
        }
        setBatches((prev) => [...prev, { id: cursor.offset, nodes: result.nodes }]);
        setCursor({ offset: result.nextOffset, hasMore: result.hasMore });
        setAnnounce((prev) => ({
          id: (prev?.id ?? 0) + 1,
          text: joinSentences([result.count > 0 ? t("loadedMore", { count: result.count }) : null, result.hasMore ? null : t("end")]),
        }));
      } catch {
        setError(true);
      } finally {
        loadingRef.current = false;
      }
    });
  }, [cursor, seed, t]);

  // Sentinela perto do fim: carrega a próxima página um pouco antes de a pessoa chegar lá.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setObserverSupported(false);
      return;
    }
    const node = sentinelRef.current;
    if (!node || !cursor.hasMore || error) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) load();
    }, { rootMargin: "600px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, error, load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-8" data-testid="home-feed">
        {children}
        {batches.map((batch) => (
          <div key={batch.id} className="contents">
            {batch.nodes}
          </div>
        ))}
      </div>

      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" data-testid="feed-sentinel" />

      <p aria-live="polite" className="sr-only">
        {announce ? <span key={announce.id}>{announce.text}</span> : null}
      </p>

      <div className="flex flex-col items-center gap-3 px-gutter md:px-0">
        {error ? (
          <div role="alert" className="flex w-full flex-col items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft/40 p-4">
            <p className="flex items-center gap-2 text-sm text-fg">
              <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden="true" />
              {t("loadError")}
            </p>
            <Button variant="secondary" size="sm" leadingIcon={<RefreshCw />} onClick={load}>
              {t("retry")}
            </Button>
          </div>
        ) : pending ? (
          <p className="flex items-center gap-2 type-caption text-fg-muted" aria-hidden="true">
            <Spinner size="sm" label="" />
            {t("loading")}
          </p>
        ) : cursor.hasMore && !observerSupported ? (
          <Button variant="secondary" onClick={load}>
            {t("loadMore")}
          </Button>
        ) : !cursor.hasMore ? (
          <p className="type-caption text-fg-muted">{t("end")}</p>
        ) : null}
      </div>
    </div>
  );
}
