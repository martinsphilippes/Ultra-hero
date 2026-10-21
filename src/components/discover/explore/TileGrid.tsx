"use client";

import { ChevronDown, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition, type MouseEvent, type ReactNode } from "react";
import { loadMoreTiles } from "@/app/(app)/explore/actions";
import { Button, Spinner } from "@/components/ui";
import { TILE_GRID } from "../grid";
import type { SearchQuery } from "./feed";
import { joinSentences, readGridHistory, writeGridHistory } from "./tiles";

type Props = {
  query: SearchQuery;
  /**
   * Semente da ordem (dia UTC); vai junto nas próximas páginas para a ordem não mudar no meio da rolagem.
   * Fica fixa durante a vida do componente: quando muda (virada do dia, troca de idioma), o pai remonta a
   * grade pela key, porque os lotes já carregados foram gerados com a semente e o idioma antigos.
   */
  seed: number;
  /** Identidade da grade (busca + semente + idioma), a mesma usada como key pelo pai. */
  gridKey: string;
  nextOffset: number;
  hasMore: boolean;
  initialCount: number;
  /** Primeira página, já renderizada no servidor. */
  children: ReactNode;
};

type Batch = { id: number; nodes: ReactNode; count: number };
type Cursor = { offset: number; hasMore: boolean };

// Profundidade da grade guardada por aba do navegador. O roteador do Next reescreve history.state a
// cada atualização de estado (inclusive respostas de server actions), então o campo próprio no
// histórico se perdia; o sessionStorage sobrevive e só é usado quando a montagem vem de um "voltar".
const STORAGE_KEY = "uh:explore-grid";
let lastPopState = 0;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastPopState = Date.now();
  });
}

function readSaved(): unknown {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Depois de tantas cargas automáticas, passa a exigir um toque: evita rolagem sem fim por acidente.
const AUTO_PAGES = 5;

// Rolagem infinita por offset: a ação devolve quadros renderizados no servidor e o cliente só anexa.
// A grade é única (primeira página + lotes) para as colunas continuarem alinhadas.
export function TileGrid({ query, seed, gridKey, nextOffset, hasMore, initialCount, children }: Props) {
  const t = useTranslations("discover.explore.grid");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [cursor, setCursor] = useState<Cursor>({ offset: nextOffset, hasMore });
  const [error, setError] = useState<string | null>(null);
  // Cada carga gera um anúncio com id próprio: o filho com key nova força o leitor de tela a falar
  // mesmo quando o texto se repete.
  const [announce, setAnnounce] = useState<{ id: number; text: string } | null>(null);
  const [autoLoads, setAutoLoads] = useState(0);
  const [observerSupported, setObserverSupported] = useState(true);
  const [manual, setManual] = useState(false);
  const [focusBatch, setFocusBatch] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Trava de pendência fora do estado: o observador pode disparar de novo antes do re-render.
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const announceSeq = useRef(0);

  const loaded = initialCount + batches.reduce((sum, batch) => sum + batch.count, 0);
  const pages = 1 + batches.length;

  const say = useCallback((text: string) => {
    announceSeq.current += 1;
    setAnnounce({ id: announceSeq.current, text });
  }, []);

  const load = useCallback(
    (auto: boolean) => {
      if (loadingRef.current || !cursor.hasMore) return;
      loadingRef.current = true;
      setError(null);
      setManual(!auto);
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
          // Carga pedida por toque: o foco vai para o primeiro quadro novo (o botão pode sumir).
          else if (result.count > 0) setFocusBatch(cursor.offset);
          say(
            joinSentences([
              result.count > 0 ? t("loadedMore", { count: result.count }) : null,
              t("count", { count: loaded + result.count }),
              result.hasMore ? null : t("end"),
            ]),
          );
        } catch {
          setError(t("loadMoreError"));
        } finally {
          loadingRef.current = false;
          setManual(false);
        }
      });
    },
    [cursor, loaded, query, say, seed, t],
  );

  // Foco no primeiro quadro do lote recém-carregado por toque.
  useEffect(() => {
    if (focusBatch === null) return;
    gridRef.current?.querySelector<HTMLElement>(`[data-batch="${focusBatch}"] a`)?.focus();
    setFocusBatch(null);
  }, [focusBatch, batches]);

  // Volta de um conteúdo: recarrega as páginas que estavam abertas e devolve o quadro à vista.
  useEffect(() => {
    // Só restaura numa volta pelo histórico (popstate recente); navegação nova começa do topo.
    const cameBack = Date.now() - lastPopState < 3000;
    const saved = cameBack ? readGridHistory(readSaved(), gridKey) : null;
    if (!saved || (saved.pages <= 1 && !saved.slug)) return;
    // O Chrome adia a restauração automática da rolagem até a página crescer e, quando os lotes
    // entram, sobrescreve a posição que damos ao quadro. Durante a restauração a rolagem é nossa.
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    let cancelled = false;
    loadingRef.current = true;
    setRestoring(true);
    (async () => {
      let next: Cursor = { offset: nextOffset, hasMore };
      const restored: Batch[] = [];
      for (let page = 1; page < saved.pages && next.hasMore; page++) {
        const result = await loadMoreTiles({ ...query, seed, offset: next.offset }).catch(() => null);
        if (cancelled || !result || !result.ok) break;
        restored.push({ id: next.offset, nodes: result.nodes, count: result.count });
        next = { offset: result.nextOffset, hasMore: result.hasMore };
      }
      if (cancelled) return;
      setBatches(restored);
      setCursor(next);
      // Conta como carga automática: a rolagem continua de onde estava, sem pedir toque antes da hora.
      setAutoLoads(restored.length);
      loadingRef.current = false;
      setRestoring(false);
      if (saved.slug) setScrollTo(saved.slug);
    })();
    return () => {
      cancelled = true;
      loadingRef.current = false;
      window.history.scrollRestoration = previousRestoration;
    };
    // Só na montagem: o estado salvo descreve a grade como ela estava ao sair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Depois que os lotes restaurados estão no DOM, leva o quadro aberto à vista e devolve o foco a ele.
  useEffect(() => {
    if (!scrollTo || restoring) return;
    // Os lotes vindos da action podem levar um tempo para entrar no DOM, e o roteador ou o navegador
    // ainda podem mexer na rolagem logo depois da volta. Por até 3s mantemos o quadro à vista,
    // parando assim que a pessoa rolar ou usar o teclado (a partir daí a rolagem é dela).
    const startedAt = performance.now();
    let handle = 0;
    let focused = false;
    let userMoved = false;
    const stop = () => {
      userMoved = true;
    };
    const events = ["wheel", "touchmove", "keydown", "pointerdown"] as const;
    events.forEach((name) => window.addEventListener(name, stop, { passive: true }));
    const attempt = () => {
      if (userMoved) return;
      const tile = gridRef.current?.querySelector<HTMLElement>(`a[href="/content/${CSS.escape(scrollTo)}"]`);
      if (tile) {
        const rect = tile.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top >= window.innerHeight) tile.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
        if (!focused) {
          tile.focus({ preventScroll: true });
          focused = true;
        }
      }
      if (performance.now() - startedAt < 3000) handle = requestAnimationFrame(attempt);
    };
    handle = requestAnimationFrame(attempt);
    return () => {
      cancelAnimationFrame(handle);
      events.forEach((name) => window.removeEventListener(name, stop));
    };
  }, [scrollTo, restoring]);

  // Guarda a profundidade atual e o quadro aberto (por aba do navegador).
  const remember = useCallback(
    (slug: string | null) => {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(writeGridHistory(readSaved(), { key: gridKey, pages, slug })));
      } catch {
        // Sem storage (modo privado restrito) só perdemos a restauração.
      }
    },
    [gridKey, pages],
  );

  useEffect(() => {
    if (!restoring && pages > 1) remember(null);
  }, [pages, remember, restoring]);

  const onGridClick = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="/content/"]');
    if (link) remember(decodeURIComponent(link.getAttribute("href")!.slice("/content/".length)));
  };

  // Sentinela abaixo da grade: ao se aproximar (200px antes), carrega a próxima página.
  // Recriado a cada cursor para o observador reavaliar a posição depois de anexar um lote.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setObserverSupported(false);
      return;
    }
    const node = sentinelRef.current;
    if (!node || restoring || !cursor.hasMore || autoLoads >= AUTO_PAGES || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) load(true);
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, autoLoads, error, load, restoring]);

  const showButton = cursor.hasMore && !error && (!observerSupported || autoLoads >= AUTO_PAGES);
  // Durante uma carga pedida por toque o botão continua montado (com aria-busy) para não perder o foco.
  const manualPending = pending && manual;

  return (
    <div className="flex flex-col gap-4">
      <p className="sr-only">{t("count", { count: loaded })}</p>

      <div ref={gridRef} className={TILE_GRID} data-testid="explore-grid" onClick={onGridClick}>
        {children}
        {batches.map((batch) => (
          <LoadedBatch key={batch.id} id={batch.id}>
            {batch.nodes}
          </LoadedBatch>
        ))}
      </div>

      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" data-testid="explore-sentinel" />

      <p aria-live="polite" className="sr-only" data-testid="explore-announce">
        {announce ? <span key={announce.id}>{announce.text}</span> : null}
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
        ) : (pending || restoring) && !error ? (
          <p className="flex items-center gap-2 type-caption text-fg-muted" aria-hidden="true">
            <Spinner size="sm" label="" />
            {t("loading")}
          </p>
        ) : !cursor.hasMore && pages > 1 ? (
          <p className="type-caption text-fg-muted">{t("end")}</p>
        ) : null}
      </div>
    </div>
  );
}

// Cada lote vem como um fragmento; `display: contents` mantém os quadros como filhos diretos da grade.
function LoadedBatch({ id, children }: { id: number; children: ReactNode }) {
  return (
    <div className="contents" data-batch={id}>
      {children}
    </div>
  );
}
