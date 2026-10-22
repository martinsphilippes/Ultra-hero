"use client";

import { ChevronDown, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { loadMoreRecipes, trackRecipeCatalogFilter } from "@/app/(app)/explore/actions";
import { Button, Spinner } from "@/components/ui";
import type { RecipeCatalogParams } from "@/lib/recipes/catalog-params";

import { RECIPE_GRID } from "./grid";

type Props = {
  params: RecipeCatalogParams;
  /** Catálogo dentro do chef (biblioteca do herói). */
  creator: string | null;
  nextCursor: string | null;
  initialCount: number;
  /** Registra recipe.catalog_filter (só os nomes) quando há busca ou filtro. */
  track: "explore" | "chef" | null;
  children: ReactNode;
};

type Batch = { id: number; nodes: ReactNode; count: number };

// Depois de tantas cargas automáticas, passa a pedir um toque (evita rolagem infinita por acidente).
const AUTO_PAGES = 3;

// Carregamento progressivo do catálogo pelo cursor de recipe_catalog: a primeira página vem do
// servidor; as seguintes chegam pela action (cards já renderizados) ao se aproximar do fim da
// grade, e depois de 3 cargas automáticas por "Carregar mais".
export function RecipeCatalogGrid({ params, creator, nextCursor, initialCount, track, children }: Props) {
  const t = useTranslations("recipes.catalog.grid");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [cursor, setCursor] = useState<string | null>(nextCursor);
  const [error, setError] = useState(false);
  const [autoLoads, setAutoLoads] = useState(0);
  const [observerSupported, setObserverSupported] = useState(true);
  const [announce, setAnnounce] = useState<{ id: number; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const loadingRef = useRef(false);
  const seq = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const tracked = useRef<string | null>(null);

  const loaded = initialCount + batches.reduce((n, b) => n + b.count, 0);

  useEffect(() => {
    if (!track) return;
    const key = JSON.stringify(params);
    if (tracked.current === key) return;
    tracked.current = key;
    void trackRecipeCatalogFilter({ params, scope: track });
  }, [params, track]);

  const load = useCallback(
    (auto: boolean) => {
      if (loadingRef.current || !cursor) return;
      loadingRef.current = true;
      setError(false);
      const before = loaded;
      startTransition(async () => {
        try {
          const result = await loadMoreRecipes({ params, creator, cursor });
          if (!result.ok) {
            setError(true);
            return;
          }
          seq.current += 1;
          const id = seq.current;
          setBatches((prev) => [...prev, { id, nodes: result.nodes, count: result.count }]);
          setCursor(result.nextCursor);
          if (auto) setAutoLoads((n) => n + 1);
          else if (result.count > 0) {
            // carga pedida por toque: o foco vai para o primeiro card novo (o botão pode sumir)
            requestAnimationFrame(() => listRef.current?.children[before]?.querySelector<HTMLElement>("a")?.focus());
          }
          setAnnounce({ id, text: [t("loaded", { count: result.count }), result.nextCursor ? null : t("end")].filter(Boolean).join(" ") });
        } catch {
          setError(true);
        } finally {
          loadingRef.current = false;
        }
      });
    },
    [creator, cursor, loaded, params, t],
  );

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setObserverSupported(false);
      return;
    }
    const node = sentinelRef.current;
    if (!node || !cursor || autoLoads >= AUTO_PAGES || error) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) load(true);
    }, { rootMargin: "300px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, autoLoads, error, load]);

  const showButton = Boolean(cursor) && !error && (!observerSupported || autoLoads >= AUTO_PAGES);

  return (
    <div className="flex flex-col gap-4">
      <p className="sr-only" data-testid="recipe-catalog-count">
        {t("count", { count: loaded })}
      </p>
      <ul ref={listRef} className={RECIPE_GRID} data-testid="recipe-catalog-grid">
        {children}
        {batches.map((b) => (
          <Fragment key={b.id}>{b.nodes}</Fragment>
        ))}
      </ul>
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      <p aria-live="polite" className="sr-only">
        {announce ? <span key={announce.id}>{announce.text}</span> : null}
      </p>
      {error ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-fg">
            <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden="true" />
            {t("error")}
          </p>
          <Button variant="secondary" size="sm" loading={pending} leadingIcon={<RefreshCw />} onClick={() => load(false)}>
            {t("retry")}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col items-center gap-2">
        {showButton ? (
          <Button variant="secondary" size="lg" aria-busy={pending || undefined} onClick={() => load(false)} trailingIcon={pending ? <Spinner size="sm" label="" /> : <ChevronDown />} data-testid="recipe-load-more">
            {pending ? t("loading") : t("loadMore")}
          </Button>
        ) : pending ? (
          <p className="flex items-center gap-2 type-caption text-fg-muted" aria-hidden="true">
            <Spinner size="sm" label="" />
            {t("loading")}
          </p>
        ) : !cursor && batches.length > 0 ? (
          <p className="type-caption text-fg-muted">{t("end")}</p>
        ) : null}
      </div>
    </div>
  );
}
