"use client";

import { Check, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { searchProducts, suggestLink, type ProductHit } from "@/app/creator/links/actions";
import { Button, DemoBadge, FormField, Input, Select, Spinner, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { cn } from "@/lib/utils";

type ContentOption = { id: string; title: string; status: string };

// Sugerir vínculo: escolhe um conteúdo próprio, busca produtos compráveis por título e envia a sugestão.
export function LinkSuggestForm({ contents }: { contents: ContentOption[] }) {
  const t = useTranslations("creator.links");
  const te = useTranslations("creator.errors");
  const ts = useTranslations("adminCommon.status");
  const tcat = useTranslations("catalog");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const router = useRouter();
  const baseId = useId();

  const [contentId, setContentId] = useState(contents[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ProductHit | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Busca com atraso curto; o servidor limita a produtos regulares (RLS + filtros).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const result = await searchProducts({ q });
      if (cancelled) return;
      setResults(result.ok ? result.products : []);
      setSearching(false);
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  function submit() {
    if (!contentId || !selected) return;
    setError(null);
    startTransition(async () => {
      const result = await suggestLink({ contentId, productId: selected.id, note });
      if (result.ok) {
        toast({ title: t("suggested"), description: t("suggestedDescription"), variant: "success" });
        setSelected(null);
        setQuery("");
        setNote("");
        router.refresh();
      } else {
        const key = result.error.split(":")[0].trim();
        setError(te.has(key) ? te(key) : te("generic"));
      }
    });
  }

  const hasContents = contents.length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5"
      aria-labelledby={`${baseId}-title`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${baseId}-title`} className="type-h3 text-fg">
          {t("formTitle")}
        </h2>
        <DemoBadge />
      </div>

      <FormField label={t("content")} hint={hasContents ? t("contentHint") : t("noContents")} required>
        <Select value={contentId} disabled={!hasContents || pending} onChange={(e) => setContentId(e.target.value)}>
          {contents.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} · {ts(c.status)}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label={t("searchProduct")} hint={t("searchHint")}>
        <Input value={query} disabled={pending} leadingIcon={<Search />} placeholder={t("searchPlaceholder")} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
      </FormField>

      <div aria-live="polite" className="flex flex-col gap-2">
        {searching && (
          <p className="flex items-center gap-2 text-sm text-fg-muted">
            <Spinner size="sm" /> {t("searching")}
          </p>
        )}
        {!searching && query.trim().length >= 2 && results.length === 0 && <p className="text-sm text-fg-muted">{t("noResults")}</p>}
        {results.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2" aria-label={t("results")}>
            {results.map((p) => {
              const isSelected = selected?.id === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    disabled={pending}
                    onClick={() => setSelected(isSelected ? null : p)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                      isSelected ? "border-accent bg-accent-soft" : "border-border bg-surface-elevated hover:border-fg-subtle",
                    )}
                  >
                    <Image src={p.image_url} alt="" width={56} height={56} unoptimized={p.image_url.endsWith(".svg")} className="size-14 shrink-0 rounded-lg border border-border object-cover" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold text-fg">{p.title}</span>
                      <span className="type-caption text-fg-muted">
                        {p.seller ? `${p.seller} · ` : ""}
                        {formatCurrency(p.price_cents_demo / 100, locale)} · {tcat("priceDemo")}
                      </span>
                    </span>
                    {isSelected && <Check className="size-5 shrink-0 text-accent-text" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected && (
        <p role="status" className="rounded-lg bg-surface-elevated px-3 py-2 text-sm text-fg">
          {t("selectedProduct", { product: selected.title })}
        </p>
      )}

      <FormField label={t("note")} hint={t("noteHint")}>
        <Textarea value={note} rows={2} maxLength={300} disabled={pending} onChange={(e) => setNote(e.target.value)} />
      </FormField>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={pending} disabled={!hasContents || !contentId || !selected}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
