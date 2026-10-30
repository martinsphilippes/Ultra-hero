"use client";

import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type TouchEvent } from "react";
import { applyNav, keyToNav, swipeToNav } from "@/lib/recipes/cook-mode";
import { parseScreenState, screenSearch, type ScreenState } from "@/lib/screen-cards";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { useDialog } from "./use-dialog";

// Cards que abrem telas em tela cheia (página do programa, Hoje): cada card abre suas telas uma a
// uma, com deslize horizontal, pontos de progresso, Anterior/Próxima, setas do teclado e gesto de
// arrastar. Estado na URL (?secao=…&tela=2): abrir empilha uma entrada no histórico (o Voltar do
// navegador fecha); trocar de tela só substitui, para o Voltar não percorrer tela por tela.

export type Screen = { id: string; title: string; body: ReactNode };
export type ScreenCard = {
  key: string;
  title: string;
  teaser: string;
  /** Ícone já renderizado (vem do servidor ou do wrapper). */
  icon: ReactNode;
  screens: Screen[];
};

type Props = {
  cards: ScreenCard[];
  /** Prefixo dos data-testid: `${prefix}-cards`, `${prefix}-card-<key>`, `${prefix}-screen-…`. */
  testIdPrefix: string;
  listClassName?: string;
  /** Nome da lista para o leitor de tela (opcional). */
  label?: string;
};

export function ScreenCards({ cards, testIdPrefix, listClassName, label }: Props) {
  const t = useTranslations("common.screenViewer");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const counts = useMemo(() => Object.fromEntries(cards.map((c) => [c.key, c.screens.length])), [cards]);
  const state = parseScreenState(searchParams, counts);
  // abrimos com pushState nesta página? então fechar = voltar no histórico
  const pushed = useRef(false);

  useEffect(() => {
    if (!state) pushed.current = false;
  }, [state]);

  const open = useCallback(
    (card: string) => {
      window.history.pushState(null, "", `${pathname}${screenSearch(window.location.search, { card, screen: 0 })}`);
      pushed.current = true;
    },
    [pathname],
  );
  const go = useCallback(
    (next: ScreenState) => {
      window.history.replaceState(null, "", `${pathname}${screenSearch(window.location.search, next)}`);
    },
    [pathname],
  );
  const close = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", `${pathname}${screenSearch(window.location.search, null)}`);
    }
  }, [pathname]);

  const active = state ? cards.find((c) => c.key === state.card) ?? null : null;
  // 5+ cards a 390 px: menos folga e letra um pouco menor para "Nutricional" caber sem quebrar no meio
  const dense = cards.length >= 5;

  return (
    <>
      {/* compactos, todos numa linha (pedido do responsável); o resumo fica para leitores de tela */}
      <ul
        className={cn("grid", dense ? "gap-1.5" : "gap-2", listClassName)}
        style={{ gridTemplateColumns: `repeat(${Math.max(1, cards.length)}, minmax(0, 1fr))` }}
        aria-label={label}
        data-testid={`${testIdPrefix}-cards`}
      >
        {cards.map((card) => (
          <li key={card.key} className="flex">
            <button
              type="button"
              onClick={() => open(card.key)}
              aria-haspopup="dialog"
              data-testid={`${testIdPrefix}-card-${card.key}`}
              data-screens={card.screens.length}
              className={cn(
                "uh-card group flex min-h-11 w-full flex-col items-center gap-1.5 rounded-xl border border-border bg-surface py-2.5 text-center shadow-sm transition-[transform,box-shadow,border-color] duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                dense ? "px-0.5" : "px-1.5",
              )}
            >
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text [&_svg]:size-[1.125rem]">
                {card.icon}
              </span>
              <span className={cn("w-full font-medium leading-tight text-fg [overflow-wrap:anywhere]", dense ? "text-[0.6875rem] tracking-[-0.01em]" : "text-[0.75rem]")}>{card.title}</span>
              {card.teaser ? (
                <span className="sr-only" data-teaser="">
                  {card.teaser}
                </span>
              ) : null}
              <span className="sr-only">{t("screens", { n: card.screens.length })}</span>
            </button>
          </li>
        ))}
      </ul>
      <ScreenViewer card={active} index={state?.screen ?? 0} onIndex={(screen) => active && go({ card: active.key, screen })} onClose={close} testIdPrefix={testIdPrefix} />
    </>
  );
}

type ViewerProps = { card: ScreenCard | null; index: number; onIndex: (index: number) => void; onClose: () => void; testIdPrefix: string };

function ScreenViewer({ card, index, onIndex, onClose, testIdPrefix: p }: ViewerProps) {
  const t = useTranslations("common.screenViewer");
  const id = useId();
  const isOpen = Boolean(card);
  const onOpenChange = useCallback((next: boolean) => (next ? undefined : onClose()), [onClose]);
  const dialog = useDialog({ open: isOpen, onOpenChange });
  const touch = useRef<{ x: number; y: number } | null>(null);
  const headings = useRef<(HTMLHeadingElement | null)[]>([]);
  const [lastCard, setLastCard] = useState<ScreenCard | null>(card);
  // mantém o último card enquanto o diálogo fecha (sem piscar vazio)
  if (card && card !== lastCard) setLastCard(card);
  const shown = card ?? lastCard;
  const total = shown?.screens.length ?? 0;
  const first = index === 0;
  const last = index >= total - 1;

  // foco no título da tela ao trocar (o leitor anuncia a tela nova; o Tab segue dali)
  const previous = useRef<{ key: string | null; index: number }>({ key: null, index: -1 });
  useEffect(() => {
    if (!card) {
      previous.current = { key: null, index: -1 };
      return;
    }
    const changed = previous.current.key === card.key && previous.current.index !== index;
    previous.current = { key: card.key, index };
    if (changed) headings.current[index]?.focus({ preventScroll: true });
  }, [card, index]);

  const nav = (to: number) => {
    if (to !== index && to >= 0 && to < total) onIndex(to);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    dialog.onKeyDown(event);
    if (event.defaultPrevented || event.key === "Tab") return;
    const move = keyToNav({ key: event.key, altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, targetTag: (event.target as HTMLElement | null)?.tagName ?? null });
    if (!move) return;
    event.preventDefault();
    nav(applyNav(index, move, total));
  };

  const onTouchStart = (event: TouchEvent) => {
    const pt = event.touches[0];
    touch.current = pt ? { x: pt.clientX, y: pt.clientY } : null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touch.current;
    const pt = event.changedTouches[0];
    touch.current = null;
    if (!start || !pt) return;
    const move = swipeToNav(pt.clientX - start.x, pt.clientY - start.y);
    if (move) nav(applyNav(index, move, total));
  };

  return (
    <dialog
      ref={dialog.ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-position`}
      onCancel={dialog.onCancel}
      onClose={dialog.onClose}
      onKeyDown={onKeyDown}
      data-testid={`${p}-screen-viewer`}
      data-card={shown?.key}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-bg p-0 text-fg open:animate-fade-in md:m-auto md:h-[min(52rem,calc(100dvh-2rem))] md:max-w-2xl md:rounded-2xl md:border md:border-border"
    >
      {shown ? (
        <div className="flex h-full flex-col">
          <header className="safe-top border-b border-border">
            <div className="flex flex-col gap-3 px-4 py-3 sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <h2 id={`${id}-title`} className="type-h3 truncate text-fg">
                    {shown.title}
                  </h2>
                  <p id={`${id}-position`} aria-live="polite" aria-atomic="true" className="type-caption text-fg-muted" data-testid={`${p}-screen-position`}>
                    {t("position", { current: Math.min(index, total - 1) + 1, total })}
                  </p>
                </div>
                <IconButton label={t("close")} icon={<X />} onClick={onClose} className="-mr-2 shrink-0" data-testid={`${p}-screen-close`} />
              </div>
              <ol aria-hidden="true" className="flex gap-1.5">
                {shown.screens.map((screen, i) => (
                  <li
                    key={screen.id}
                    className={cn("h-1 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none", i <= index ? "bg-accent" : "bg-border-strong")}
                  />
                ))}
              </ol>
            </div>
          </header>

          <div className="relative min-h-0 flex-1 overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <div
              className="flex h-full transition-transform duration-300 ease-out-expo motion-reduce:transition-none"
              style={{ transform: `translateX(-${Math.min(index, total - 1) * 100}%)` }}
            >
              {shown.screens.map((screen, i) => {
                const current = i === index;
                return (
                  <section
                    key={screen.id}
                    aria-labelledby={`${id}-screen-${i}`}
                    aria-hidden={!current}
                    inert={!current}
                    data-testid={current ? `${p}-screen-current` : undefined}
                    data-screen={screen.id}
                    className="h-full w-full shrink-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
                  >
                    <div className="mx-auto flex max-w-prose flex-col gap-4">
                      <h3
                        id={`${id}-screen-${i}`}
                        ref={(el) => {
                          headings.current[i] = el;
                        }}
                        tabIndex={-1}
                        data-autofocus={current ? "" : undefined}
                        className="type-h2 text-fg focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                      >
                        {screen.title}
                      </h3>
                      {screen.body}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <footer className="safe-bottom border-t border-border">
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <Button variant="secondary" leadingIcon={<ArrowLeft />} onClick={() => nav(index - 1)} disabled={first} data-testid={`${p}-screen-back`}>
                {t("back")}
              </Button>
              {last ? (
                <Button variant="primary" leadingIcon={<Check />} onClick={onClose} data-testid={`${p}-screen-done`}>
                  {t("done")}
                </Button>
              ) : (
                <Button variant="primary" trailingIcon={<ArrowRight />} onClick={() => nav(index + 1)} data-testid={`${p}-screen-next`}>
                  {t("next")}
                </Button>
              )}
            </div>
          </footer>
        </div>
      ) : null}
    </dialog>
  );
}
