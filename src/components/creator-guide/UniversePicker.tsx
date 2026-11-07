"use client";

import { Check, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { BrandLogo } from "@/components/brand-universe/BrandLogo";
import { Button, Input } from "@/components/ui";
import { saveUniversesAction } from "@/lib/creator-guide/actions";
import { cn } from "@/lib/utils";

// Universos (0136): o creator marca os segmentos que fazem sentido e, em cada um, as marcas que já conhece e as que
// quer explorar. Uma marca fica em "conheço" ou em "quero explorar", nunca nos dois. Salvar grava tudo de uma vez.

type Brand = { id: string; name: string; logo_url: string | null; category: string };
type Category = { slug: string; name: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function UniversePicker({
  categories,
  brands,
  initial,
}: {
  categories: Category[];
  brands: Brand[];
  initial: { universes: string[]; known: string[]; explore: string[] };
}) {
  const t = useTranslations("creatorGuide.universes");
  const router = useRouter();
  const [universes, setUniverses] = useState(() => new Set(initial.universes));
  const [known, setKnown] = useState(() => new Set(initial.known));
  const [explore, setExplore] = useState(() => new Set(initial.explore));
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const byCategory = useMemo(() => {
    const q = norm(query.trim());
    const map = new Map<string, Brand[]>();
    for (const b of brands) {
      if (q && !norm(b.name).includes(q)) continue;
      const list = map.get(b.category) ?? [];
      list.push(b);
      map.set(b.category, list);
    }
    return map;
  }, [brands, query]);

  const same = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x));
  const dirty = !same(universes, initial.universes) || !same(known, initial.known) || !same(explore, initial.explore);
  const visible = categories.filter((c) => !query.trim() || (byCategory.get(c.slug)?.length ?? 0) > 0);

  function mark(kind: "known" | "explore", id: string) {
    if (kind === "known") {
      setKnown((s) => toggle(s, id));
      setExplore((s) => (s.has(id) ? toggle(s, id) : s));
    } else {
      setExplore((s) => toggle(s, id));
      setKnown((s) => (s.has(id) ? toggle(s, id) : s));
    }
    setMsg(null);
  }

  return (
    <div className="flex flex-col gap-4 pb-24" data-testid="universe-picker">
      <label className="relative block">
        <span className="sr-only">{t("search")}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} className="pl-9" type="search" />
      </label>

      {visible.length === 0 ? <p className="type-body-sm text-fg-muted">{t("empty")}</p> : null}

      {visible.map((c) => {
        const list = byCategory.get(c.slug) ?? [];
        const on = universes.has(c.slug);
        return (
          <section key={c.slug} className={cn("flex flex-col gap-3 rounded-2xl border bg-surface p-4", on ? "border-accent" : "border-border")} aria-labelledby={`uni-${c.slug}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 id={`uni-${c.slug}`} className="text-base font-semibold text-fg">
                  {c.name}
                </h2>
                <p className="type-caption text-fg-muted">{t("brandsCount", { count: list.length })}</p>
              </div>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setUniverses((s) => toggle(s, c.slug));
                  setMsg(null);
                }}
                className={cn(
                  "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  on ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface text-fg hover:bg-surface-hover",
                )}
                data-testid={`universe-${c.slug}`}
              >
                {on ? <Check className="size-4" aria-hidden="true" /> : null}
                {t("fits")}
              </button>
            </div>
            {list.length > 0 ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {list.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 rounded-xl border border-border p-2">
                    <BrandLogo name={b.name} url={b.logo_url} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{b.name}</span>
                    <span className="flex shrink-0 gap-1">
                      {(["known", "explore"] as const).map((kind) => {
                        const active = (kind === "known" ? known : explore).has(b.id);
                        return (
                          <button
                            key={kind}
                            type="button"
                            aria-pressed={active}
                            aria-label={`${t(kind)}: ${b.name}`}
                            onClick={() => mark(kind, b.id)}
                            className={cn(
                              "min-h-9 rounded-full border px-2.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                              active ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-muted hover:bg-surface-hover",
                            )}
                          >
                            {t(kind)}
                          </button>
                        );
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 backdrop-blur md:sticky md:rounded-2xl md:border">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
          <Button
            loading={pending}
            disabled={!dirty}
            onClick={() =>
              start(async () => {
                setMsg(null);
                const r = await saveUniversesAction({ universes: [...universes], known: [...known], explore: [...explore] });
                if (!r.ok) return setMsg({ ok: false, text: r.error });
                setMsg({ ok: true, text: t("saved") });
                router.refresh();
              })
            }
            data-testid="universes-save"
          >
            {t("save")}
          </Button>
          <p role={msg ? (msg.ok ? "status" : "alert") : undefined} className={cn("type-caption", msg ? (msg.ok ? "text-success" : "text-danger") : "text-fg-muted")}>
            {msg ? msg.text : dirty ? t("dirty") : t("summary", { universes: universes.size, brands: known.size + explore.size })}
          </p>
        </div>
      </div>
    </div>
  );
}
