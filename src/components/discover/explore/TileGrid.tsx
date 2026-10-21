"use client";

import { ChevronDown, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { loadMoreTiles } from "@/app/(app)/explore/actions";
import { Button, Spinner } from "@/components/ui";
import { TILE_GRID } from "../grid";
import type { SearchQuery } from "./feed";

type Props = {
  query: SearchQuery;
  /** Semente da ordem (dia UTC); vai junto nas próximas páginas para a ordem não mudar no meio da rolagem. */
  seed: number;
  nextOffset: number;
  hasMore: boolean;
  initialCount: number;
  /** Primeira página, já renderizada no servidor. */
  children: ReactNode;
};

type Batch = { id: number; nodes: ReactNode; count: number };

// Depois de tantas cargas automáticas, passa a exigir um toque: evita rolagem sem fim por acidente.
const AUTO_PAGES = 5;

// Rolagem infinita por offset: a ação devolve quadros renderizados no servidor e o cliente só anexa.
// A grade é única (primeira página + lotes) para as colunas continuarem alinhadas.
export function TileGrid({ query, seed, nextOffset, hasMore, initialCount, children }: Props) {
  const t = useTranslations("discover.explore.grid");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [cursor, setCursor] = useState({ offset: nextOffset, hasMore });
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [autoLoads, setAutoLoads] = useState(0);
  const [observerSupported, setObserverSupported] = useState(true);
  const [pending, startTransition] = useTransition();
  // Trava de pendência fora do estado: o observador pode disparar de novo antes do re-render.
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loaded = initialCount + batches.reduce((sum, batch) => sum + batch.count, 0);
  const pages = 1 + batches.length;

  const load = useCallback(
    (auto: boolean) => {
      if (loadingRef.current || !cursor.hasMore) return;
      loadingRef.current = true;
      setError(null);
      startTransition(async () => {
        try {
          const result = await loadMoreTiles({ ...query, seed, offset: cursor.offset });
          if (!result.ok) {
            setError(t("loadMoreError"));
            return;
          }
          setBatches((prev) => [...prev, { id: cursor.offset, nodes: result.nodes, count: result.count }]);
          setCursor({ offset: result.nextOffset, hasMore: result.hasMore });
          if (auto) setAutoLoads((n) => n + 1);
          const more = result.count > 0 ? t("loadedMore", { count: result.count }) : "";
          setAnnounce(result.hasMore ? more : [more, t("end")].filter(Boolean).join(" "));
        } catch {
          setError(t("loadMoreError"));
        } finally {
          loadingRef.current = false;
        }
      });
    },
    [cursor, query, seed, t],
  );

  // Sentinela abaixo da grade: ao se aproximar (600px antes), carrega a próxima página.
  // Recriado a cada cursor para o observador reavaliar a posição depois de anexar um lote.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setObserverSupported(false);
      return;
    }
    const node = sentinelRef.current;
    if (!node || !cursor.hasMore || autoLoads >= AUTO_PAGES || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) load(true);
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, autoLoads, error, load]);

  const showButton = cursor.hasMore && !error && (!observerSupported || autoLoads >= AUTO_PAGES);

  return (
    <div className="flex flex-col gap-4">
      <p className="sr-only">{t("count", { count: loaded })}</p>

      <div className={TILE_GRID} data-testid="explore-grid">
        {children}
        {batches.map((batch) => (
          <LoadedBatch key={batch.id}>{batch.nodes}</LoadedBatch>
        ))}
      </div>

      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" data-testid="explore-sentinel" />

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      {error ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-center gap-2 text-sm text-fg">
            <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden="true" />
            {error}
          </p>
          <Button variant="secondary" size="sm" loading={pending} leadingIcon={<RefreshCw />} onClick={() => load(false)}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-2">
        {pending && !error ? (
          <p className="flex items-center gap-2 type-caption text-fg-muted" aria-hidden="true">
            <Spinner size="sm" label="" />
            {t("loading")}
          </p>
        ) : showButton ? (
          <Button variant="secondary" size="lg" onClick={() => load(false)} trailingIcon={<ChevronDown />}>
            {t("loadMore")}
          </Button>
        ) : !cursor.hasMore && pages > 1 ? (
          <p className="type-caption text-fg-muted">{t("end")}</p>
        ) : null}
      </div>
    </div>
  );
}

// Cada lote vem como um fragmento; `display: contents` mantém os quadros como filhos diretos da grade.
function LoadedBatch({ children }: { children: ReactNode }) {
  return <div className="contents">{children}</div>;
}
