"use client";

import { SHOP_SORTS, type ShopSort } from "./shop-sorts";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useId, useTransition } from "react";
import { Button, Chip, Input, Select } from "@/components/ui";


type Props = {
  categories: { code: string; label: string }[];
  sellers: { slug: string; name: string }[];
  current: { q: string; category: string | null; seller: string | null; sort: ShopSort };
  resultCount: number;
};

// Filtros da loja: tudo na URL (compartilhável, funciona com voltar/avançar; busca envia via GET).
export function ShopFilters({ categories, sellers, current, resultCount }: Props) {
  const t = useTranslations("commerce.shop");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const id = useId();
  const [pending, startTransition] = useTransition();

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      startTransition(() => router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
    },
    [params, pathname, router],
  );

  const hasFilters = Boolean(current.q || current.category || current.seller || current.sort !== "newest");

  return (
    <div className="flex flex-col gap-4" aria-busy={pending || undefined}>
      <form
        role="search"
        action={pathname}
        method="get"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const q = (new FormData(e.currentTarget).get("q") as string | null)?.trim() ?? "";
          update({ q: q || null });
        }}
      >
        {current.category ? <input type="hidden" name="category" value={current.category} /> : null}
        {current.seller ? <input type="hidden" name="seller" value={current.seller} /> : null}
        {current.sort !== "newest" ? <input type="hidden" name="sort" value={current.sort} /> : null}
        <label htmlFor={`${id}-q`} className="sr-only">
          {t("searchLabel")}
        </label>
        <Input id={`${id}-q`} name="q" type="search" defaultValue={current.q} placeholder={t("searchPlaceholder")} leadingIcon={<Search />} enterKeyHint="search" autoComplete="off" className="flex-1" />
        <Button type="submit" variant="secondary">
          {t("searchLabel")}
        </Button>
      </form>

      <div className="-mx-gutter flex gap-2 overflow-x-auto px-gutter pb-1 scrollbar-none" role="group" aria-label={t("categoriesLabel")}>
        <Chip selected={!current.category} onClick={() => update({ category: null })}>
          {t("categoryAll")}
        </Chip>
        {categories.map((c) => (
          <Chip key={c.code} selected={current.category === c.code} onClick={() => update({ category: current.category === c.code ? null : c.code })}>
            {c.label}
          </Chip>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-seller`} className="text-sm font-semibold text-fg">
            {t("sellerLabel")}
          </label>
          <Select id={`${id}-seller`} value={current.seller ?? ""} onChange={(e) => update({ seller: e.target.value || null })} selectSize="sm">
            <option value="">{t("sellerAll")}</option>
            {sellers.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-sort`} className="text-sm font-semibold text-fg">
            {t("sortLabel")}
          </label>
          <Select id={`${id}-sort`} value={current.sort} onChange={(e) => update({ sort: e.target.value === "newest" ? null : e.target.value })} selectSize="sm">
            {SHOP_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sort.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <p className="type-caption text-fg-muted" aria-live="polite">
            {t("results", { n: resultCount })}
          </p>
          {hasFilters ? (
            <Button type="button" variant="ghost" size="sm" leadingIcon={<X />} onClick={() => startTransition(() => router.push(pathname, { scroll: false }))}>
              {t("clearFilters")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
