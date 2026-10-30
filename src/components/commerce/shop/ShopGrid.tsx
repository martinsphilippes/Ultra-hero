"use client";

import { ChevronDown, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { loadMoreShop } from "@/app/(app)/shop/grid-actions";
import { Button, Spinner } from "@/components/ui";

type Props = {
  /** Slug do filtro escolhido (null = Tudo); vai junto nas próximas páginas. */
  filtro: string | null;
  label: string;
  nextOffset: number;
  hasMore: boolean;
  initialCount: number;
  /** Primeira página (itens <li>), já renderizada no servidor. */
  children: ReactNode;
};

type Batch = { id: number; nodes: ReactNode; count: number };

// Depois de tantas cargas automáticas, passa a pedir um toque (como a grade do Explorar).
const AUTO_PAGES = 5;

// Grade da aba Comprar: 3 por linha no celular, rolagem infinita com "Carregar mais" de reserva.
export function ShopGrid({ filtro, label, nextOffset, hasMore, initialCount, children }: Props) {
  const t = useTranslations("commerce.shop.grid");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [cursor, setCursor] = useState({ offset: nextOffset, hasMore });
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState<{ id: number; text: string } | null>(null);
  const [autoLoads, setAutoLoads] = useState(0);
  const [observerSupported, setObserverSupported] = useState(true);
  const [manual, setManual] = useState(false);
  const [focusBatch, setFocusBatch] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLUListElement>(null);
  const announceSeq = useRef(0);

  const loaded = initialCount + batches.reduce((sum, batch) => sum + batch.count, 0);

  const load = useCallback(
    (auto: boolean) => {
      if (loadingRef.current || !cursor.hasMore) return;
      loadingRef.current = true;
      setError(null);
      setManual(!auto);
      startTransition(async () => {
        try {
          const result = await loadMoreShop({ filtro, offset: cursor.offset });
          if (!result.ok) {
            setError(t("loadMoreError"));
            return;
          }
          setBatches((prev) => [...prev, { id: cursor.offset, nodes: result.nodes, count: result.count }]);
          setCursor({ offset: result.nextOffset, hasMore: result.hasMore });
          if (auto) setAutoLoads((n) => n + 1);
          else if (result.count > 0) setFocusBatch(cursor.offset);
          announceSeq.current += 1;
          setAnnounce({ id: announceSeq.current, text: [t("count", { count: loaded + result.count }), result.hasMore ? null : t("end")].filter(Boolean).join(" ") });
        } catch {
          setError(t("loadMoreError"));
        } finally {
          loadingRef.current = false;
          setManual(false);
        }
      });
    },
    [cursor, filtro, loaded, t],
  );

  // Carga pedida por toque: o foco vai para o primeiro produto novo (o botão pode sumir).
  useEffect(() => {
    if (focusBatch === null) return;
    gridRef.current?.querySelector<HTMLElement>(`[data-batch="${focusBatch}"] a`)?.focus();
    setFocusBatch(null);
  }, [focusBatch, batches]);

  // Sentinela abaixo da grade: ao se aproximar (200px antes), carrega a próxima página.
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
      { rootMargin: "200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, autoLoads, error, load]);

  const showButton = cursor.hasMore && !error && (!observerSupported || autoLoads >= AUTO_PAGES);
  const manualPending = pending && manual;

  return (
    <div className="flex flex-col gap-4">
      <ul
        ref={gridRef}
        aria-label={label}
        data-testid="shop-grid"
        className="-mx-gutter grid grid-cols-3 gap-x-0.5 gap-y-3 md:mx-0 md:grid-cols-4 md:gap-x-4 md:gap-y-6 lg:grid-cols-5"
      >
        {children}
        {batches.map((batch) => (
          <Fragment key={batch.id}>{batch.nodes}</Fragment>
        ))}
      </ul>

      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" data-testid="shop-sentinel" />

      <p aria-live="polite" className="sr-only" data-testid="shop-announce">
        {announce ? <span key={announce.id}>{announce.text}</span> : null}
      </p>

      {error ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-fg">
            <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden="true" />
            {error}
          </p>
          <Button variant="secondary" size="sm" aria-busy={manualPending || undefined} leadingIcon={manualPending ? <Spinner size="sm" label="" /> : <RefreshCw />} onClick={() => load(false)}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-2">
        {showButton || (manualPending && !error) ? (
          <Button
            variant="secondary"
            size="lg"
            aria-busy={manualPending || undefined}
            aria-disabled={manualPending || undefined}
            onClick={() => load(false)}
            trailingIcon={manualPending ? <Spinner size="sm" label="" /> : <ChevronDown />}
          >
            {manualPending ? t("loading") : t("loadMore")}
          </Button>
        ) : pending && !error ? (
          <p className="flex items-center gap-2 type-caption text-fg-muted" aria-hidden="true">
            <Spinner size="sm" label="" />
            {t("loading")}
          </p>
        ) : !cursor.hasMore && batches.length > 0 ? (
          <p className="type-caption text-fg-muted">{t("end")}</p>
        ) : null}
      </div>
    </div>
  );
}
