"use client";

import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { searchProductsAction } from "@/app/admin/content-actions";
import { deleteShopFilterAction, moveShopFilterAction, saveShopFilterAction, setShopFilterActiveAction } from "@/app/admin/shop-filters/actions";
import { ConfirmActionDialog } from "@/components/admin";
import { Badge, Button, Checkbox, Dialog, FormField, IconButton, Input, Switch, useToast } from "@/components/ui";
import { shopHref, slugifyLabel } from "@/lib/shop/filters";
import { ActionButton } from "./ActionButton";
import { SearchPicker, type PickItem } from "./SearchPicker";

export type ShopFilterNames = { "pt-BR": string; en: string; es: string };
export type ShopFilterCategory = { id: string; label: string };
export type ShopFilterProduct = { id: string; title: string; subtitle: string | null };
export type ShopFilterRow = {
  id: string;
  slug: string;
  name: ShopFilterNames;
  is_active: boolean;
  categoryIds: string[];
  products: ShopFilterProduct[];
  /** Produtos visíveis na loja que o filtro mostra hoje (0 = chip escondido). */
  visibleCount: number;
};

type Props = { filters: ShopFilterRow[]; categories: ShopFilterCategory[] };

// Filtros da aba Comprar: lista na ordem da loja (subir/descer), ativar, editar e excluir.
export function ShopFiltersEditor({ filters, categories }: Props) {
  const t = useTranslations("adminContent.shopFilters");
  const tc = useTranslations("adminContent.common");
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<ShopFilterRow | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const categoryLabel = new Map(categories.map((c) => [c.id, c.label]));

  function move(id: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveShopFilterAction(id, direction);
      if (result.ok) router.refresh();
      else toast({ title: result.error, variant: "error" });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-caption text-fg-muted">{t("allFixed")}</p>
        <Button type="button" size="sm" leadingIcon={<Plus />} onClick={() => setEditing("new")}>
          {t("new")}
        </Button>
      </div>

      {filters.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface" aria-label={t("listLabel")}>
          {filters.map((row, index) => {
            const name = row.name["pt-BR"];
            const rule = [
              ...row.categoryIds.map((id) => categoryLabel.get(id)).filter((v): v is string => Boolean(v)),
              ...(row.products.length > 0 ? [t("manualCount", { count: row.products.length })] : []),
            ];
            return (
              <li key={row.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center" data-testid="shop-filter-row">
                <span className="type-numeric w-8 shrink-0 text-sm font-bold text-fg-muted" aria-label={t("position", { n: index + 1 })}>
                  {index + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{name}</span>
                    <span className="font-mono text-xs text-fg-muted">{row.slug}</span>
                    <Badge size="sm" variant={row.is_active ? "success" : "neutral"}>
                      {row.is_active ? t("active") : t("inactive")}
                    </Badge>
                    {row.is_active && row.visibleCount === 0 ? (
                      <Badge size="sm" variant="warning">
                        {t("hiddenEmpty")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-fg-muted">{rule.length > 0 ? rule.join(" · ") : t("noRule")}</p>
                  <p className="text-xs text-fg-muted">{t("visibleCount", { count: row.visibleCount })}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  <IconButton icon={<ArrowUp />} label={`${tc("moveUp")} · ${name}`} size="sm" onClick={() => move(row.id, "up")} disabled={index === 0 || pending} />
                  <IconButton icon={<ArrowDown />} label={`${tc("moveDown")} · ${name}`} size="sm" onClick={() => move(row.id, "down")} disabled={index === filters.length - 1 || pending} />
                  <IconButton icon={<Pencil />} label={`${tc("edit")} · ${name}`} size="sm" onClick={() => setEditing(row)} />
                  {row.is_active && row.visibleCount > 0 ? (
                    <IconButton asChild icon={<ExternalLink />} label={`${t("viewInShop")} · ${name}`} size="sm">
                      <Link href={shopHref(row.slug)} target="_blank" rel="noopener" />
                    </IconButton>
                  ) : null}
                  <ActionButton action={() => setShopFilterActiveAction(row.id, !row.is_active)} variant="ghost">
                    {row.is_active ? t("deactivate") : t("activate")}
                  </ActionButton>
                  <ConfirmActionDialog
                    triggerLabel={
                      <>
                        <Trash2 className="size-4" aria-hidden="true" />
                        <span className="sr-only">{`${tc("remove")} · ${name}`}</span>
                      </>
                    }
                    triggerVariant="ghost"
                    title={t("deleteTitle", { name })}
                    description={t("deleteDescription")}
                    confirmLabel={tc("remove")}
                    destructive
                    action={() => deleteShopFilterAction(row.id)}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {editing !== null && <ShopFilterDialog filter={editing === "new" ? null : editing} categories={categories} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ShopFilterDialog({ filter, categories, onClose }: { filter: ShopFilterRow | null; categories: ShopFilterCategory[]; onClose: () => void }) {
  const t = useTranslations("adminContent.shopFilters");
  const tc = useTranslations("adminContent.common");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<ShopFilterNames>(filter?.name ?? { "pt-BR": "", en: "", es: "" });
  const [slug, setSlug] = useState(filter?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(filter));
  const [active, setActive] = useState(filter?.is_active ?? true);
  const [categoryIds, setCategoryIds] = useState<string[]>(filter?.categoryIds ?? []);
  const [products, setProducts] = useState<ShopFilterProduct[]>(filter?.products ?? []);

  function setPt(value: string) {
    setNames({ ...names, "pt-BR": value });
    if (!slugTouched) setSlug(slugifyLabel(value));
  }

  function addProduct(item: PickItem | null) {
    if (!item || products.some((p) => p.id === item.id)) return;
    setProducts([...products, { id: item.id, title: item.title, subtitle: item.subtitle ?? null }]);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveShopFilterAction({
        id: filter?.id ?? null,
        slug,
        name: names,
        is_active: active,
        categoryIds,
        productIds: products.map((p) => p.id),
      });
      if (result.ok) {
        toast({ title: result.message ?? tc("saved"), variant: "success" });
        router.refresh();
        onClose();
      } else setError(result.error);
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && !pending && onClose()}
      title={filter ? t("editTitle") : t("new")}
      description={t("dialogDescription")}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {tc("cancel")}
          </Button>
          <Button type="button" onClick={submit} loading={pending}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={t("namePt")} required>
            <Input value={names["pt-BR"]} onChange={(e) => setPt(e.target.value)} maxLength={40} />
          </FormField>
          <FormField label={t("nameEn")} hint={t("nameFallback")}>
            <Input value={names.en} onChange={(e) => setNames({ ...names, en: e.target.value })} maxLength={40} />
          </FormField>
          <FormField label={t("nameEs")} hint={t("nameFallback")}>
            <Input value={names.es} onChange={(e) => setNames({ ...names, es: e.target.value })} maxLength={40} />
          </FormField>
        </div>
        <FormField label={t("slug")} hint={t("slugHint")} required>
          <Input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            maxLength={40}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className="font-mono"
          />
        </FormField>
        <Switch id="shop-filter-active" checked={active} onCheckedChange={setActive} label={t("active")} description={t("activeHint")} />

        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-semibold text-fg">{t("categories")}</legend>
          <p className="type-caption text-fg-muted">{t("categoriesHint")}</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {categories.map((c) => (
              <Checkbox
                key={c.id}
                id={`shop-filter-cat-${c.id}`}
                label={c.label}
                checked={categoryIds.includes(c.id)}
                onChange={(e) => setCategoryIds(e.target.checked ? [...categoryIds, c.id] : categoryIds.filter((id) => id !== c.id))}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-fg">{t("products")}</span>
          <p className="type-caption text-fg-muted">{t("productsHint")}</p>
          <SearchPicker label={t("searchProduct")} search={searchProductsAction} value={null} onChange={addProduct} />
          {products.length === 0 ? (
            <p className="text-sm text-fg-muted">{t("noProducts")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border" aria-label={t("products")}>
              {products.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-fg">{p.title}</span>
                    {p.subtitle ? <span className="block truncate text-xs text-fg-muted">{p.subtitle}</span> : null}
                  </span>
                  <IconButton icon={<X />} label={`${tc("remove")} · ${p.title}`} size="sm" onClick={() => setProducts(products.filter((x) => x.id !== p.id))} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
