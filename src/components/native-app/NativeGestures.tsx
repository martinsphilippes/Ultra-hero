"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { Spinner } from "@/components/ui/spinner";
import { adjacentTab, isTabSwipe, PULL_REST, PULL_TRIGGER, pullDistance, SWIPE_EDGE } from "@/lib/native-app/gestures";

const TABS = NAV_ITEMS.filter((item) => !item.webOnly).map((item) => item.href);
const NO_GESTURE = "dialog, [role='dialog'], [role='slider'], [data-no-gesture], input, textarea, select, video, iframe";
const SCROLLER = ".uh-native-scroller";

type Gesture = { x: number; y: number; target: Element; atTop: boolean; mode: "pull" | "swipe" | "none" | null; pull: number };

function scrolledAncestor(from: Element, stop: Element | null, axis: "x" | "y"): boolean {
  for (let el: Element | null = from; el && el !== stop && el !== document.body; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (axis === "x") {
      if (/(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth) return true;
    } else if (/(auto|scroll)/.test(style.overflowY) && el.scrollTop > 0) {
      return true;
    }
  }
  return false;
}

// Só no app das lojas (o layout raiz só monta aqui): puxar para atualizar no topo de qualquer tela, arrastar de lado
// entre as abas e a posição da rolagem das abas, que no app rola num contêiner próprio (.uh-native-scroller, globals.css).
export function NativeGestures() {
  const router = useRouter();
  const pathname = usePathname();
  const [refreshing, startRefresh] = useTransition();
  const indicator = useRef<HTMLDivElement>(null);
  const path = useRef(pathname);
  const wasPop = useRef(false);
  const positions = useRef(new Map<string, number>());

  // Tela nova começa no topo; voltar devolve onde a pessoa estava.
  useEffect(() => {
    path.current = pathname;
    const scroller = document.querySelector(SCROLLER);
    if (!scroller) return;
    const top = wasPop.current ? (positions.current.get(pathname) ?? 0) : 0;
    wasPop.current = false;
    scroller.scrollTop = top;
    if (top > 0) requestAnimationFrame(() => (scroller.scrollTop = top));
  }, [pathname]);

  useEffect(() => {
    const onPop = () => (wasPop.current = true);
    const onScroll = (e: Event) => {
      const el = e.target;
      if (el instanceof Element && el.matches(SCROLLER)) positions.current.set(path.current, el.scrollTop);
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, []);

  useEffect(() => {
    let gesture: Gesture | null = null;

    const paint = (pull: number, animate: boolean) => {
      const scroller = document.querySelector<HTMLElement>(SCROLLER);
      const transition = animate ? "transform 180ms ease-out, opacity 180ms ease-out" : "none";
      if (scroller) {
        scroller.style.transition = transition;
        scroller.style.transform = pull > 0 ? `translateY(${pull}px)` : "";
      }
      const el = indicator.current;
      if (!el) return;
      const header = document.querySelector(".uh-header")?.getBoundingClientRect().bottom ?? 0;
      el.style.top = `${header}px`;
      el.style.height = `${Math.max(pull, 0)}px`;
      el.style.opacity = `${Math.min(1, pull / PULL_TRIGGER)}`;
      el.style.transition = animate ? "height 180ms ease-out, opacity 180ms ease-out" : "none";
    };

    const onStart = (e: TouchEvent) => {
      gesture = null;
      if (e.touches.length !== 1 || !(e.target instanceof Element) || e.target.closest(NO_GESTURE)) return;
      const touch = e.touches[0];
      const scroller = document.querySelector(SCROLLER);
      const top = scroller ? scroller.scrollTop : window.scrollY;
      gesture = { x: touch.clientX, y: touch.clientY, target: e.target, atTop: top <= 0 && !scrolledAncestor(e.target, scroller, "y"), mode: null, pull: 0 };
    };

    const onMove = (e: TouchEvent) => {
      if (!gesture) return;
      if (e.touches.length !== 1) {
        if (gesture.mode === "pull") paint(0, true);
        gesture = null;
        return;
      }
      const dx = e.touches[0].clientX - gesture.x;
      const dy = e.touches[0].clientY - gesture.y;
      // No topo, a primeira descida já é nossa: depois que a rolagem nativa começa, o toque não pode mais ser cancelado.
      if (gesture.mode === null && gesture.atTop && dy > 0 && dy >= Math.abs(dx)) gesture.mode = "pull";
      else if (gesture.mode === null && Math.max(Math.abs(dx), Math.abs(dy)) >= 8) gesture.mode = Math.abs(dx) > Math.abs(dy) ? "swipe" : "none";
      if (gesture.mode !== "pull") return;
      if (e.cancelable) e.preventDefault();
      gesture.pull = pullDistance(dy);
      paint(gesture.pull, false);
    };

    const onEnd = (e: TouchEvent) => {
      const done = gesture;
      gesture = null;
      if (!done) return;
      if (done.mode === "pull") {
        if (done.pull < PULL_TRIGGER) {
          paint(0, true);
          return;
        }
        paint(PULL_REST, true);
        startRefresh(() => router.refresh());
        return;
      }
      const touch = e.changedTouches[0];
      if (done.mode !== "swipe" || !touch || done.x < SWIPE_EDGE || done.x > window.innerWidth - SWIPE_EDGE) return;
      if (!isTabSwipe(touch.clientX - done.x, touch.clientY - done.y) || scrolledAncestor(done.target, null, "x")) return;
      const href = adjacentTab(path.current, touch.clientX - done.x, TABS);
      if (href) router.push(href);
    };

    const onCancel = () => {
      if (gesture?.mode === "pull") paint(0, true);
      gesture = null;
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, [router]);

  // Terminou de atualizar: a página volta ao lugar.
  const wasRefreshing = useRef(false);
  useEffect(() => {
    if (wasRefreshing.current && !refreshing) {
      const scroller = document.querySelector<HTMLElement>(SCROLLER);
      if (scroller) scroller.style.transform = "";
      if (indicator.current) {
        indicator.current.style.height = "0px";
        indicator.current.style.opacity = "0";
      }
    }
    wasRefreshing.current = refreshing;
  }, [refreshing]);

  return (
    <div ref={indicator} aria-hidden="true" data-testid="pull-refresh" className="pointer-events-none fixed inset-x-0 z-30 flex items-center justify-center overflow-hidden" style={{ height: 0, opacity: 0 }}>
      <Spinner />
    </div>
  );
}
