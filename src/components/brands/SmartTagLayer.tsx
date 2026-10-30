"use client";

import { Tag, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { IconButton, Sheet } from "@/components/ui";
import { fitLabelSide, tagFramePosition, type ImageFit, type LabelSide, type Size, type SmartTagView } from "@/lib/brands";
import { cn } from "@/lib/utils";
import { ProductCard } from "./ProductCard";

type Props = {
  tags: readonly SmartTagView[];
  /** Como a foto ocupa o quadro (object-cover no feed; object-contain na página do post). */
  fit: ImageFit;
  /** Seletor da <img> da foto dentro do mesmo quadro (para ler o tamanho real). */
  imageSelector?: string;
  /** Marcações já visíveis ao abrir (página do post); no feed ficam escondidas até o toque. */
  defaultRevealed?: boolean;
  className?: string;
};

const DESKTOP = "(min-width: 768px)";
// metade da área de toque do ponto (44 px): o centro do ponto cai exatamente na coordenada
const HALF_HIT = 22;

function wrapperStyle(side: LabelSide, leftPct: number, topPct: number): CSSProperties {
  const base: CSSProperties = { left: `${leftPct}%`, top: `${topPct}%` };
  switch (side) {
    case "left":
      return { ...base, transform: `translate(calc(-100% + ${HALF_HIT}px), -50%)` };
    case "top":
      return { ...base, transform: `translate(-50%, calc(-100% + ${HALF_HIT}px))` };
    case "bottom":
      return { ...base, transform: `translate(-50%, -${HALF_HIT}px)` };
    default:
      return { ...base, transform: `translate(-${HALF_HIT}px, -50%)` };
  }
}

const FLEX: Record<LabelSide, string> = { right: "flex-row", left: "flex-row-reverse", top: "flex-col-reverse", bottom: "flex-col" };
const LINE: Record<LabelSide, string> = { right: "h-px w-5", left: "h-px w-5", top: "h-4 w-px", bottom: "h-4 w-px" };
const LINE_DIR: Record<LabelSide, string> = { right: "90deg", left: "270deg", top: "0deg", bottom: "180deg" };

// Ultra Hero Smart Tags: produtos marcados pelo admin sobre a foto. Ponto que brilha, linha fina até
// o rótulo. A posição é em % da foto e acompanha o quadro em qualquer tamanho, com object-cover
// (feed, corta) ou object-contain (página do post, sobra borda). No feed, um botão discreto mostra
// as marcações; tocar numa abre o card do produto (folha no celular, popover no computador).
export function SmartTagLayer({ tags, fit, imageSelector = "img", defaultRevealed = false, className }: Props) {
  const t = useTranslations("brands");
  const ta = useTranslations("common.a11y");
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const popoverId = useId();
  const [revealed, setRevealed] = useState(defaultRevealed);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [frame, setFrame] = useState<Size>({ width: 0, height: 0 });
  const [natural, setNatural] = useState<Size | null>(null);
  const [desktop, setDesktop] = useState(false);

  // quadro: tamanho atual (gira o celular, muda a coluna)
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const read = () => setFrame({ width: node.clientWidth, height: node.clientHeight });
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // foto: tamanho real (proporção) quando carregar
  useEffect(() => {
    const img = rootRef.current?.parentElement?.querySelector<HTMLImageElement>(imageSelector) ?? null;
    if (!img) return;
    const read = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) setNatural({ width: img.naturalWidth, height: img.naturalHeight });
    };
    read();
    img.addEventListener("load", read);
    return () => img.removeEventListener("load", read);
  }, [imageSelector]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(DESKTOP);
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  const close = useCallback(() => {
    setActiveId(null);
    lastTrigger.current?.focus();
  }, []);

  // popover: Esc e toque fora fecham; o foco vai para o card ao abrir
  useEffect(() => {
    if (!activeId || !desktop) return;
    popoverRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || lastTrigger.current?.contains(target)) return;
      setActiveId(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [activeId, desktop, close]);

  if (tags.length === 0) return null;

  const placed = tags.map((tag) => {
    const pos = tagFramePosition({ x: tag.x, y: tag.y }, frame, natural, fit);
    return { tag, pos, side: fitLabelSide(tag.side, pos) };
  });
  const active = placed.find((p) => p.tag.id === activeId) ?? null;

  return (
    <div ref={rootRef} className={cn("pointer-events-none absolute inset-0", className)} data-testid="smart-tag-layer" data-revealed={revealed ? "true" : "false"}>
      {revealed ? (
        <ul aria-label={t("tags.region")} className="absolute inset-0">
          {placed
            .filter((p) => p.pos.visible)
            .map(({ tag, pos, side }, index) => (
              // a animação de entrada fica no botão: no <li> ela sobrescreveria o transform que posiciona
              <li key={tag.id} className="uh-tag absolute" style={wrapperStyle(side, pos.leftPct, pos.topPct)}>
                <button
                  type="button"
                  style={{ animationDelay: `${index * 70}ms` }}
                  className={cn("uh-tag-in pointer-events-auto flex items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus", FLEX[side])}
                  aria-label={t("tags.open", { name: tag.product.name, brand: tag.product.brand.name })}
                  aria-expanded={activeId === tag.id}
                  aria-controls={activeId === tag.id && desktop ? popoverId : undefined}
                  onClick={(event) => {
                    lastTrigger.current = event.currentTarget;
                    setActiveId((current) => (current === tag.id ? null : tag.id));
                  }}
                  data-testid="smart-tag"
                  data-x={pos.leftPct}
                  data-y={pos.topPct}
                >
                  <span className="relative flex size-11 shrink-0 items-center justify-center">
                    <span aria-hidden="true" className="uh-tag-ring absolute size-4 rounded-full" />
                    <span aria-hidden="true" className="uh-tag-dot relative size-3.5 rounded-full" />
                  </span>
                  <span aria-hidden="true" className={cn("uh-tag-line shrink-0", LINE[side])} style={{ ["--uh-tag-dir" as string]: LINE_DIR[side] }} />
                  <span aria-hidden="true" className="uh-tag-chip flex max-w-[150px] flex-col items-start rounded-lg px-2.5 py-1 text-left">
                    <span className="w-full truncate text-[12px] font-semibold leading-tight text-white">{tag.product.name}</span>
                    <span className="w-full truncate text-[10px] uppercase leading-tight tracking-[0.12em] text-[#9ff6ec]">{tag.product.brand.name}</span>
                  </span>
                </button>
              </li>
            ))}
        </ul>
      ) : null}

      {/* indicador discreto: há produtos na foto; tocar mostra/esconde as marcações */}
      <button
        type="button"
        onClick={() => {
          setRevealed((r) => !r);
          setActiveId(null);
        }}
        aria-pressed={revealed}
        aria-label={revealed ? t("tags.hide") : t("tags.show")}
        className={cn(
          "pointer-events-auto absolute bottom-2.5 right-2.5 inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2.5 text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          revealed ? "uh-tag-chip" : "bg-black/45 backdrop-blur-sm hover:bg-black/60",
        )}
        data-testid="smart-tag-toggle"
      >
        <Tag aria-hidden="true" className="size-4" />
        <span aria-hidden="true" className="text-xs font-semibold type-numeric">
          {placed.length}
        </span>
      </button>

      {/* computador: popover sobre a foto, perto da marcação */}
      {active && desktop ? (
        <div
          ref={popoverRef}
          id={popoverId}
          role="dialog"
          aria-label={active.tag.product.name}
          tabIndex={-1}
          className="uh-tag-in pointer-events-auto absolute z-10 w-[min(300px,calc(100%-16px))] overflow-y-auto rounded-2xl border border-border-strong bg-surface p-4 text-fg shadow-lg outline-none"
          style={{
            ...(active.pos.leftPct < 50 ? { left: `min(calc(${active.pos.leftPct}% + 20px), calc(100% - min(300px, 100% - 16px) - 8px))` } : { right: `min(calc(${100 - active.pos.leftPct}% + 20px), calc(100% - min(300px, 100% - 16px) - 8px))` }),
            ...(active.pos.topPct < 50 ? { top: "8px" } : { bottom: "8px" }),
            maxHeight: "calc(100% - 16px)",
          }}
          data-testid="smart-tag-popover"
        >
          <IconButton label={ta("closeDialog")} icon={<X />} size="sm" onClick={close} className="absolute right-2 top-2" />
          <ProductCard product={active.tag.product} source="tag" compact className="[&>div:first-child]:pr-7" />
        </div>
      ) : null}

      {/* celular: folha de baixo */}
      {!desktop ? (
        <Sheet open={Boolean(active)} onOpenChange={(open) => (open ? null : close())} title={active?.tag.product.name ?? ""} hideTitle className="pointer-events-auto">
          {active ? <ProductCard product={active.tag.product} source="tag" className="pb-4" /> : null}
        </Sheet>
      ) : null}
    </div>
  );
}
