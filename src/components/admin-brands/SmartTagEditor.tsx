"use client";

import { Crosshair, Save, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { saveContentSmartTagsAction } from "@/app/admin/marcas/actions";
import { Button, IconButton, Select, Switch } from "@/components/ui";
import { clampPct, fitLabelSide, framePointToImagePct, LABEL_SIDES, suggestLabelSide, type LabelSide } from "@/lib/brands";
import { MAX_SMART_TAGS, type BrandStatus } from "@/lib/brands/admin";
import type { AdminTag, ProductOption } from "@/lib/brands/admin-queries";
import { cn } from "@/lib/utils";
import { useRun } from "./use-run";

type Tag = { key: string; brand_product_id: string; x_pct: number; y_pct: number; label_side: LabelSide; status: BrandStatus };

type Props = {
  contentId: string;
  /** Capa/foto atual do conteúdo (a que o público vê). */
  imageUrl: string | null;
  tags: AdminTag[];
  products: ProductOption[];
};

const FLEX: Record<LabelSide, string> = { right: "flex-row", left: "flex-row-reverse", top: "flex-col-reverse", bottom: "flex-col" };
const TRANSLATE: Record<LabelSide, string> = {
  right: "translate(-10px, -50%)",
  left: "translate(calc(-100% + 10px), -50%)",
  top: "translate(-50%, calc(-100% + 10px))",
  bottom: "translate(-50%, -10px)",
};

let seq = 0;
const nextKey = () => `t${++seq}`;

// Editor das Smart Tags (0062): escolha o produto, toque na foto para marcar, arraste para ajustar,
// lado do rótulo, ativa/desativa e tira. A posição é em % da FOTO (a imagem aqui aparece inteira,
// sem corte), então vale no feed (cover) e na página do post (contain). Setas movem a selecionada.
export function SmartTagEditor({ contentId, imageUrl, tags, products }: Props) {
  const t = useTranslations("adminOps.brands.tags");
  const tl = useTranslations("adminOps.brands");
  const locale = useLocale();
  const pct = (n: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
  const { pending, error, run, setError } = useRun();
  const imgRef = useRef<HTMLImageElement>(null);
  const dragging = useRef<string | null>(null);
  const [list, setList] = useState<Tag[]>(() => tags.map((tag) => ({ key: nextKey(), ...tag })));
  const [selected, setSelected] = useState<string | null>(null);
  const [picked, setPicked] = useState(products[0]?.id ?? "");
  const byId = new Map(products.map((p) => [p.id, p]));
  const stale = Boolean(imageUrl) && tags.some((tag) => tag.media_url && tag.media_url !== imageUrl);
  const full = list.length >= MAX_SMART_TAGS;

  if (!imageUrl) return <p className="type-body-sm text-fg-muted">{t("noImage")}</p>;

  function pointToPct(clientX: number, clientY: number) {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const natural = img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null;
    return framePointToImagePct({ x: clientX - rect.left, y: clientY - rect.top }, { width: rect.width, height: rect.height }, natural, "contain");
  }

  function update(key: string, patch: Partial<Tag>) {
    setList((current) => current.map((tag) => (tag.key === key ? { ...tag, ...patch } : tag)));
  }

  function addAt(clientX: number, clientY: number) {
    if (!picked || full) return;
    const point = pointToPct(clientX, clientY);
    if (!point) return;
    const tag: Tag = { key: nextKey(), brand_product_id: picked, x_pct: point.x, y_pct: point.y, label_side: suggestLabelSide(point), status: "active" };
    setList((current) => [...current, tag]);
    setSelected(tag.key);
    setError(null);
  }

  function onDotKey(event: KeyboardEvent, tag: Tag) {
    const step = event.shiftKey ? 5 : 1;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = delta[event.key];
    if (!d) return;
    event.preventDefault();
    update(tag.key, { x_pct: Math.round(clampPct(tag.x_pct + d[0]) * 100) / 100, y_pct: Math.round(clampPct(tag.y_pct + d[1]) * 100) / 100 });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="admin-smart-tag-editor">
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {stale ? (
        <p role="note" className="rounded-lg border border-warning/40 bg-warning-soft/50 px-3 py-2 text-sm text-fg">
          {t("staleWarning")}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <Select aria-label={t("pickProduct")} value={picked} disabled={pending || full} onChange={(e) => setPicked(e.target.value)} data-testid="admin-smart-tag-product">
            <option value="">{t("pickProduct")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.brand}
                {p.status === "inactive" ? ` (${tl("productStatus.inactive")})` : ""}
              </option>
            ))}
          </Select>
          <p className="flex items-center gap-1.5 type-caption text-fg-muted">
            <Crosshair aria-hidden="true" className="size-3.5" />
            {full ? t("limit") : picked ? t("hint") : t("hintPick")}
          </p>
          {/* foto inteira, sem corte: o quadro é a própria foto */}
          <div className="relative w-full touch-none select-none overflow-hidden rounded-xl border border-border bg-black" data-testid="admin-smart-tag-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageUrl}
              alt=""
              draggable={false}
              className={cn("block h-auto w-full", picked && !full ? "cursor-crosshair" : "cursor-default")}
              onClick={(e) => addAt(e.clientX, e.clientY)}
            />
            {list.map((tag, index) => {
              const product = byId.get(tag.brand_product_id);
              const side = fitLabelSide(tag.label_side, { leftPct: tag.x_pct, topPct: tag.y_pct });
              const active = selected === tag.key;
              return (
                <div
                  key={tag.key}
                  className={cn("uh-tag pointer-events-none absolute flex items-center", FLEX[side], tag.status === "inactive" && "opacity-45")}
                  style={{ left: `${tag.x_pct}%`, top: `${tag.y_pct}%`, transform: TRANSLATE[side] }}
                >
                  <button
                    type="button"
                    aria-label={`${index + 1}. ${product?.name ?? ""} — ${t("position", { x: pct(tag.x_pct), y: pct(tag.y_pct) })}. ${t("nudge")}`}
                    aria-pressed={active}
                    className={cn(
                      "pointer-events-auto relative flex size-5 shrink-0 cursor-grab items-center justify-center rounded-full active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                      active && "ring-2 ring-white ring-offset-2 ring-offset-black",
                    )}
                    onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      dragging.current = tag.key;
                      setSelected(tag.key);
                    }}
                    onPointerMove={(e) => {
                      if (dragging.current !== tag.key) return;
                      const point = pointToPct(e.clientX, e.clientY);
                      if (point) update(tag.key, { x_pct: point.x, y_pct: point.y });
                    }}
                    onPointerUp={(e) => {
                      dragging.current = null;
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                    onKeyDown={(e) => onDotKey(e, tag)}
                    data-testid="admin-smart-tag-dot"
                  >
                    <span aria-hidden="true" className="uh-tag-dot size-3.5 rounded-full" />
                  </button>
                  <span aria-hidden="true" className={cn("uh-tag-line shrink-0", side === "left" || side === "right" ? "h-px w-3" : "h-3 w-px")} />
                  <span aria-hidden="true" className="uh-tag-chip max-w-[120px] truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {index + 1}. {product?.name ?? "?"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t("list")}</h3>
          {list.length === 0 ? <p className="type-caption text-fg-muted">{t("empty")}</p> : null}
          <ol className="flex flex-col gap-2">
            {list.map((tag, index) => {
              const product = byId.get(tag.brand_product_id);
              return (
                <li
                  key={tag.key}
                  className={cn("flex flex-col gap-2 rounded-xl border bg-bg p-3", selected === tag.key ? "border-accent" : "border-border")}
                  onFocusCapture={() => setSelected(tag.key)}
                  data-testid="admin-smart-tag-row"
                >
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-sm font-medium text-fg">
                      {index + 1}. {product ? `${product.name} · ${product.brand}` : "?"}
                      <span className="block type-caption text-fg-muted type-numeric">{t("position", { x: pct(tag.x_pct), y: pct(tag.y_pct) })}</span>
                    </span>
                    <IconButton label={`${t("remove")}: ${product?.name ?? ""}`} icon={<Trash2 />} size="sm" disabled={pending} onClick={() => setList((c) => c.filter((x) => x.key !== tag.key))} />
                  </div>
                  <Select
                    aria-label={`${t("pickProduct")}: ${index + 1}`}
                    selectSize="sm"
                    value={tag.brand_product_id}
                    disabled={pending}
                    onChange={(e) => update(tag.key, { brand_product_id: e.target.value })}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.brand}
                      </option>
                    ))}
                  </Select>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select aria-label={`${t("side")}: ${index + 1}`} selectSize="sm" value={tag.label_side} disabled={pending} onChange={(e) => update(tag.key, { label_side: e.target.value as LabelSide })} className="w-auto">
                      {LABEL_SIDES.map((s) => (
                        <option key={s} value={s}>
                          {t(`sides.${s}`)}
                        </option>
                      ))}
                    </Select>
                    <Switch size="sm" checked={tag.status === "active"} label={t("active")} disabled={pending} onCheckedChange={(on) => update(tag.key, { status: on ? "active" : "inactive" })} />
                  </div>
                </li>
              );
            })}
          </ol>
          <Button
            type="button"
            className="self-start"
            loading={pending}
            leadingIcon={<Save />}
            onClick={() =>
              run(() =>
                saveContentSmartTagsAction(
                  contentId,
                  list.map(({ brand_product_id, x_pct, y_pct, label_side, status }) => ({ brand_product_id, x_pct, y_pct, label_side, status })),
                ),
              )
            }
            data-testid="admin-smart-tags-save"
          >
            {t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
