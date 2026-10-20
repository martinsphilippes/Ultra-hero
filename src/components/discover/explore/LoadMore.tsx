"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { loadMoreContent } from "@/app/(app)/explore/actions";
import { Button } from "@/components/ui";
import { CARD_GRID } from "../grid";
import type { SearchQuery } from "./search";

type Props = {
  query: SearchQuery;
  nextOffset: number;
  hasMore: boolean;
  pageSize: number;
  initialCount: number;
  /** Primeira página, já renderizada no servidor. */
  children: ReactNode;
};

type Batch = { id: number; nodes: ReactNode; count: number };

// Paginação por offset: a ação devolve cards renderizados no servidor e o cliente só anexa.
// A grade é única (primeira página + lotes) para as colunas continuarem alinhadas.
export function LoadMore({ query, nextOffset, hasMore, pageSize, initialCount, children }: Props) {
  const t = useTranslations("discover.explore.search");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [cursor, setCursor] = useState({ offset: nextOffset, hasMore });
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const loaded = initialCount + batches.reduce((sum, batch) => sum + batch.count, 0);

  function load() {
    setError(null);
    startTransition(async () => {
      const result = await loadMoreContent({ ...query, offset: cursor.offset });
      if (!result.ok) {
        setError(t("loadMoreError"));
        return;
      }
      setBatches((prev) => [...prev, { id: cursor.offset, nodes: result.nodes, count: result.count }]);
      setCursor({ offset: result.nextOffset, hasMore: result.hasMore });
      setAnnounce(result.count > 0 ? t("loadedMore", { count: result.count }) : t("endOfResults"));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={CARD_GRID}>
        {children}
        {batches.map((batch) => (
          <LoadedBatch key={batch.id}>{batch.nodes}</LoadedBatch>
        ))}
      </div>

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col items-center gap-2 pt-2">
        {cursor.hasMore ? (
          <Button variant="secondary" size="lg" onClick={load} loading={pending} trailingIcon={<ChevronDown />} aria-describedby="load-more-hint">
            {t("loadMore")}
          </Button>
        ) : loaded > pageSize ? (
          <p className="type-caption text-fg-muted">{t("endOfResults")}</p>
        ) : null}
        <span id="load-more-hint" className="sr-only">
          {t("moreResults")}
        </span>
      </div>
    </div>
  );
}

// Cada lote vem como um fragmento; `display: contents` mantém os cards como filhos diretos da grade.
function LoadedBatch({ children }: { children: ReactNode }) {
  return <div className="contents">{children}</div>;
}
