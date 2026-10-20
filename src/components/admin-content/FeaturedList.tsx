"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { searchContentAction, searchProgramsAction, setFeaturedAction } from "@/app/admin/content-actions";
import { reorderFeaturedAction } from "@/app/admin/featured/actions";
import { StatusBadge } from "@/components/admin";
import { Badge, Button, useToast } from "@/components/ui";
import { ActionButton } from "./ActionButton";
import { SearchPicker, type PickItem } from "./SearchPicker";

export type FeaturedRow = { id: string; title: string; subtitle: string | null; status: string; rank: number | null; href: string };

type Props = { kind: "content" | "program"; rows: FeaturedRow[] };

// Lista ordenada de destaques com mover/remover e adição via busca.
export function FeaturedList({ kind, rows }: Props) {
  const t = useTranslations("adminContent.featured");
  const tc = useTranslations("adminContent.common");
  const ts = useTranslations("adminCommon.status");
  const router = useRouter();
  const { toast } = useToast();
  const [picked, setPicked] = useState<PickItem | null>(null);
  const [pending, startTransition] = useTransition();

  function move(index: number, direction: "up" | "down") {
    const ids = rows.map((r) => r.id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    startTransition(async () => {
      const result = await reorderFeaturedAction(kind, ids);
      if (result.ok) router.refresh();
      else toast({ title: result.error, variant: "error" });
    });
  }

  function add() {
    if (!picked) return;
    startTransition(async () => {
      const result = await setFeaturedAction(kind, picked.id, true, null);
      if (result.ok) {
        toast({ title: t("added"), variant: "success" });
        setPicked(null);
        router.refresh();
      } else toast({ title: result.error, variant: "error" });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 rounded-lg border border-dashed border-border-strong p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <SearchPicker
          label={kind === "content" ? t("searchContent") : t("searchProgram")}
          search={(q) => (kind === "content" ? searchContentAction(q, true) : searchProgramsAction(q, true))}
          value={picked}
          onChange={setPicked}
        />
        <Button type="button" onClick={add} disabled={!picked} loading={pending} leadingIcon={<Plus />}>
          {t("add")}
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
          {rows.map((row, index) => (
            <li key={row.id} className="flex items-center gap-3 p-3">
              <span className="type-numeric w-8 shrink-0 text-center text-sm font-bold text-fg-muted" aria-label={t("rank", { n: index + 1 })}>
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Link href={row.href} className="truncate text-sm font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  {row.title}
                </Link>
                <div className="flex flex-wrap items-center gap-1.5">
                  {row.subtitle && <span className="truncate text-xs text-fg-muted">{row.subtitle}</span>}
                  <StatusBadge status={row.status} label={ts(row.status as never)} />
                  {row.status !== "published" && (
                    <Badge variant="warning" size="sm">
                      {t("notPublished")}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => move(index, "up")} disabled={index === 0 || pending} aria-label={`${tc("moveUp")} · ${row.title}`}>
                  <ArrowUp className="size-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => move(index, "down")} disabled={index === rows.length - 1 || pending} aria-label={`${tc("moveDown")} · ${row.title}`}>
                  <ArrowDown className="size-4" aria-hidden="true" />
                </Button>
                <ActionButton icon={<Trash2 />} label={`${tc("remove")} · ${row.title}`} variant="ghost" className="text-danger" action={() => setFeaturedAction(kind, row.id, false, null)} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
