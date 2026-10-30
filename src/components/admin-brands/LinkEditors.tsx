"use client";

import { ArrowDown, ArrowUp, Plus, Save, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { saveContentBrandLinksAction, saveCreatorBrandsAction, saveProgramBrandProductsAction } from "@/app/admin/marcas/actions";
import { Badge, Button, IconButton, Input, Select, Switch } from "@/components/ui";
import { RELATIONSHIPS, type Relationship } from "@/lib/brands";
import { MAX_CONTENT_LINKS, MAX_CREATOR_BRANDS, MAX_PROGRAM_PRODUCTS, PROGRAM_NOTE_MAX, type BrandLinkItem, type ProductLinkItem } from "@/lib/brands/admin";
import type { BrandOption, ProductOption } from "@/lib/brands/admin-queries";
import { useRun } from "./use-run";

// Ligações de marcas/produtos (0062): herói ↔ marca (com a relação), programa ↔ produto e
// conteúdo ↔ marcas citadas + produtos recomendados. A lista é editada aqui e salva de uma vez
// (RPC auditada troca a lista inteira, na ordem).

function move<T>(list: T[], index: number, delta: number): T[] {
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(index + delta, 0, item);
  return next;
}

type BrandListProps = { value: BrandLinkItem[]; onChange: (v: BrandLinkItem[]) => void; options: BrandOption[]; max: number; disabled?: boolean; testId: string };

function BrandList({ value, onChange, options, max, disabled, testId }: BrandListProps) {
  const t = useTranslations("adminOps.brands");
  const [picked, setPicked] = useState("");
  const byId = new Map(options.map((o) => [o.id, o]));
  const taken = new Set(value.map((v) => v.id));
  const full = value.length >= max;
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {value.length === 0 ? <p className="type-caption text-fg-muted">{t("links.none")}</p> : null}
      <ol className="flex flex-col gap-2">
        {value.map((item, i) => {
          const brand = byId.get(item.id);
          const label = brand?.name ?? item.id;
          return (
            <li key={item.id} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3 sm:flex-row sm:items-center">
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm font-medium text-fg">
                {i + 1}. {label}
                {brand?.is_demo ? (
                  <Badge variant="demo" size="sm">
                    {t("demo")}
                  </Badge>
                ) : null}
                {brand?.status === "inactive" ? (
                  <Badge variant="neutral" size="sm">
                    {t("status.inactive")}
                  </Badge>
                ) : null}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label={`${t("links.relationship")}: ${label}`}
                  selectSize="sm"
                  value={item.relationship}
                  disabled={disabled}
                  onChange={(e) => onChange(value.map((v) => (v.id === item.id ? { ...v, relationship: e.target.value as Relationship } : v)))}
                  className="w-auto"
                >
                  {RELATIONSHIPS.map((r) => (
                    <option key={r} value={r}>
                      {t(`relationship.${r}`)}
                    </option>
                  ))}
                </Select>
                <Switch
                  size="sm"
                  checked={item.status === "active"}
                  label={t("links.active")}
                  disabled={disabled}
                  onCheckedChange={(on) => onChange(value.map((v) => (v.id === item.id ? { ...v, status: on ? "active" : "inactive" } : v)))}
                />
                <IconButton label={`${t("links.moveUp")}: ${label}`} icon={<ArrowUp />} size="sm" disabled={disabled || i === 0} onClick={() => onChange(move(value, i, -1))} />
                <IconButton label={`${t("links.moveDown")}: ${label}`} icon={<ArrowDown />} size="sm" disabled={disabled || i === value.length - 1} onClick={() => onChange(move(value, i, 1))} />
                <IconButton label={`${t("links.remove")}: ${label}`} icon={<X />} size="sm" disabled={disabled} onClick={() => onChange(value.filter((v) => v.id !== item.id))} />
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-end gap-2">
        <Select aria-label={t("links.selectBrand")} value={picked} disabled={disabled || full} onChange={(e) => setPicked(e.target.value)} className="min-w-0 flex-1">
          <option value="">{t("links.selectBrand")}</option>
          {options
            .filter((o) => !taken.has(o.id))
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.is_demo ? ` · ${t("demo")}` : ""}
              </option>
            ))}
        </Select>
        <Button
          type="button"
          variant="secondary"
          leadingIcon={<Plus />}
          disabled={disabled || full || !picked}
          onClick={() => {
            const option = byId.get(picked);
            if (!option) return;
            onChange([...value, { id: option.id, relationship: option.default_relationship, status: "active" }]);
            setPicked("");
          }}
        >
          {t("links.addBrand")}
        </Button>
      </div>
    </div>
  );
}

type ProductListProps = { value: ProductLinkItem[]; onChange: (v: ProductLinkItem[]) => void; options: ProductOption[]; max: number; withNote?: boolean; disabled?: boolean; testId: string };

function ProductList({ value, onChange, options, max, withNote, disabled, testId }: ProductListProps) {
  const t = useTranslations("adminOps.brands");
  const [picked, setPicked] = useState("");
  const byId = new Map(options.map((o) => [o.id, o]));
  const taken = new Set(value.map((v) => v.id));
  const full = value.length >= max;
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {value.length === 0 ? <p className="type-caption text-fg-muted">{t("links.none")}</p> : null}
      <ol className="flex flex-col gap-2">
        {value.map((item, i) => {
          const product = byId.get(item.id);
          const label = product ? `${product.name} · ${product.brand}` : item.id;
          return (
            <li key={item.id} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm font-medium text-fg">
                  {i + 1}. {label}
                  {product?.is_demo ? (
                    <Badge variant="demo" size="sm">
                      {t("demo")}
                    </Badge>
                  ) : null}
                  {product?.status === "inactive" ? (
                    <Badge variant="neutral" size="sm">
                      {t("productStatus.inactive")}
                    </Badge>
                  ) : null}
                </span>
                <Switch
                  size="sm"
                  checked={item.status === "active"}
                  label={t("links.active")}
                  disabled={disabled}
                  onCheckedChange={(on) => onChange(value.map((v) => (v.id === item.id ? { ...v, status: on ? "active" : "inactive" } : v)))}
                />
                <IconButton label={`${t("links.moveUp")}: ${label}`} icon={<ArrowUp />} size="sm" disabled={disabled || i === 0} onClick={() => onChange(move(value, i, -1))} />
                <IconButton label={`${t("links.moveDown")}: ${label}`} icon={<ArrowDown />} size="sm" disabled={disabled || i === value.length - 1} onClick={() => onChange(move(value, i, 1))} />
                <IconButton label={`${t("links.remove")}: ${label}`} icon={<X />} size="sm" disabled={disabled} onClick={() => onChange(value.filter((v) => v.id !== item.id))} />
              </div>
              {withNote ? (
                <Input
                  aria-label={`${t("links.note")}: ${label}`}
                  placeholder={t("links.note")}
                  inputSize="sm"
                  value={item.note}
                  maxLength={PROGRAM_NOTE_MAX}
                  disabled={disabled}
                  onChange={(e) => onChange(value.map((v) => (v.id === item.id ? { ...v, note: e.target.value } : v)))}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-end gap-2">
        <Select aria-label={t("links.selectProduct")} value={picked} disabled={disabled || full} onChange={(e) => setPicked(e.target.value)} className="min-w-0 flex-1">
          <option value="">{t("links.selectProduct")}</option>
          {options
            .filter((o) => !taken.has(o.id))
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {o.brand}
              </option>
            ))}
        </Select>
        <Button
          type="button"
          variant="secondary"
          leadingIcon={<Plus />}
          disabled={disabled || full || !picked}
          onClick={() => {
            if (!byId.has(picked)) return;
            onChange([...value, { id: picked, status: "active", note: "" }]);
            setPicked("");
          }}
        >
          {t("links.addProduct")}
        </Button>
      </div>
    </div>
  );
}

function ManageLink() {
  const t = useTranslations("adminOps.brands");
  return (
    <Link href="/admin/marcas" className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
      {t("links.manage")}
    </Link>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="type-body-sm text-danger">
      {error}
    </p>
  ) : null;
}

/** Marcas do herói (/admin/creators/[id]). */
export function CreatorBrandsEditor({ creatorId, items, options }: { creatorId: string; items: BrandLinkItem[]; options: BrandOption[] }) {
  const t = useTranslations("adminOps.brands");
  const { pending, error, run } = useRun();
  const [list, setList] = useState(items);
  return (
    <div className="flex flex-col gap-3">
      <ErrorLine error={error} />
      <BrandList value={list} onChange={setList} options={options} max={MAX_CREATOR_BRANDS} disabled={pending} testId="admin-creator-brands" />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" loading={pending} leadingIcon={<Save />} onClick={() => run(() => saveCreatorBrandsAction(creatorId, list))} data-testid="admin-creator-brands-save">
          {t("links.save")}
        </Button>
        <ManageLink />
      </div>
    </div>
  );
}

/** Equipamentos recomendados do programa (/admin/programs/[id]). */
export function ProgramBrandProductsEditor({ programId, items, options }: { programId: string; items: ProductLinkItem[]; options: ProductOption[] }) {
  const t = useTranslations("adminOps.brands");
  const { pending, error, run } = useRun();
  const [list, setList] = useState(items);
  return (
    <div className="flex flex-col gap-3">
      <ErrorLine error={error} />
      <ProductList value={list} onChange={setList} options={options} max={MAX_PROGRAM_PRODUCTS} withNote disabled={pending} testId="admin-program-brand-products" />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" loading={pending} leadingIcon={<Save />} onClick={() => run(() => saveProgramBrandProductsAction(programId, list))} data-testid="admin-program-brand-products-save">
          {t("links.save")}
        </Button>
        <ManageLink />
      </div>
    </div>
  );
}

/** Marcas citadas e produtos recomendados do conteúdo/post (/admin/content/[id]). */
export function ContentBrandLinksEditor({
  contentId,
  brands,
  products,
  brandOptions,
  productOptions,
}: {
  contentId: string;
  brands: BrandLinkItem[];
  products: ProductLinkItem[];
  brandOptions: BrandOption[];
  productOptions: ProductOption[];
}) {
  const t = useTranslations("adminOps.brands");
  const { pending, error, run } = useRun();
  const [brandList, setBrandList] = useState(brands);
  const [productList, setProductList] = useState(products);
  return (
    <div className="flex flex-col gap-4">
      <ErrorLine error={error} />
      <section aria-labelledby="content-brands-mentioned" className="flex flex-col gap-2">
        <h3 id="content-brands-mentioned" className="text-sm font-semibold text-fg">
          {t("links.brands")}
        </h3>
        <BrandList value={brandList} onChange={setBrandList} options={brandOptions} max={MAX_CONTENT_LINKS} disabled={pending} testId="admin-content-brands" />
      </section>
      <section aria-labelledby="content-brands-products" className="flex flex-col gap-2">
        <h3 id="content-brands-products" className="text-sm font-semibold text-fg">
          {t("links.products")}
        </h3>
        <ProductList value={productList} onChange={setProductList} options={productOptions} max={MAX_CONTENT_LINKS} disabled={pending} testId="admin-content-brand-products" />
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" loading={pending} leadingIcon={<Save />} onClick={() => run(() => saveContentBrandLinksAction(contentId, brandList, productList))} data-testid="admin-content-brand-links-save">
          {t("links.save")}
        </Button>
        <ManageLink />
      </div>
    </div>
  );
}
