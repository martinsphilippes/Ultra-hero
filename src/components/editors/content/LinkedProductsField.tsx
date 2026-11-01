"use client";

import { ShoppingBag, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormField, IconButton, Select } from "@/components/ui";
import type { ProductOption } from "@/lib/post-blocks/queries";
import { LINKED_PRODUCTS_MAX } from "./schema";

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  products: ProductOption[];
  disabled?: boolean;
};

// Produtos vinculados ao conteúdo (content_product_links validados), escolhidos aqui mesmo em vez de
// só na tela de vínculos. A página do conteúdo mostra até 6 ("Produtos relacionados").
export function LinkedProductsField({ value, onChange, products, disabled = false }: Props) {
  const t = useTranslations("editors.linkedProducts");
  const chosen = new Set(value);
  const full = value.length >= LINKED_PRODUCTS_MAX;
  const titleOf = (id: string) => products.find((p) => p.id === id)?.title ?? t("unavailable");
  return (
    <div className="flex flex-col gap-3" data-testid="linked-products">
      {value.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label={t("chosen")}>
          {value.map((id) => (
            <li key={id} className="flex items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3 py-2" data-testid="linked-product-item">
              <ShoppingBag className="size-4 shrink-0 text-accent-text" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{titleOf(id)}</span>
              <IconButton label={t("remove", { name: titleOf(id) })} icon={<Trash2 />} variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(value.filter((v) => v !== id))} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-caption text-fg-muted">{t("empty")}</p>
      )}
      {!full ? (
        <FormField label={t("pick")} hint={products.length === 0 ? t("noProducts") : t("max", { max: LINKED_PRODUCTS_MAX })}>
          <Select
            value=""
            disabled={disabled || products.length === 0}
            aria-label={t("pick")}
            onChange={(e) => {
              const id = e.target.value;
              if (id && !chosen.has(id)) onChange([...value, id]);
            }}
            data-testid="linked-product-pick"
          >
            <option value="">{t("choose")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id} disabled={chosen.has(p.id)}>
                {p.title}
              </option>
            ))}
          </Select>
        </FormField>
      ) : (
        <p className="type-caption text-fg-muted">{t("max", { max: LINKED_PRODUCTS_MAX })}</p>
      )}
    </div>
  );
}
