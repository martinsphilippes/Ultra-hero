"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { Badge, type BadgeVariant } from "@/components/ui";
import type { BoardStage } from "@/lib/today/logic";
import { cn } from "@/lib/utils";

// Painel de ações por etapa (0078). Celular: abas com contagem e a lista da etapa escolhida; desktop: as
// cinco colunas lado a lado. Os textos e datas chegam prontos do servidor (fuso da agência, sem hidratação
// divergente); aqui só se escolhe a aba.

export type StageCard = {
  key: string;
  href: string;
  title: string;
  subtitle: string;
  meta: string | null;
  badge: { label: string; variant: BadgeVariant } | null;
};

type Props = { stages: readonly BoardStage[]; columns: Record<BoardStage, StageCard[]>; initial?: BoardStage };

function CardList({ items, empty }: { items: StageCard[]; empty: string }) {
  if (items.length === 0) return <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center type-caption text-fg-muted">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((c) => (
        <li key={c.key}>
          <Link
            href={c.href}
            className="flex min-h-14 items-start gap-2 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            data-testid="board-card"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-semibold text-fg">{c.title}</span>
              {c.subtitle ? <span className="type-caption text-fg-muted">{c.subtitle}</span> : null}
              {c.badge || c.meta ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  {c.badge ? (
                    <Badge size="sm" variant={c.badge.variant}>
                      {c.badge.label}
                    </Badge>
                  ) : null}
                  {c.meta ? <span className="type-caption text-fg-muted">{c.meta}</span> : null}
                </span>
              ) : null}
            </span>
            <ArrowRight className="mt-1 size-4 shrink-0 text-fg-muted" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function StageBoard({ stages, columns, initial }: Props) {
  const t = useTranslations("today.board");
  const first = initial ?? stages.find((s) => columns[s].length > 0) ?? stages[0];
  const [current, setCurrent] = useState<BoardStage>(first);

  return (
    <div data-testid="stage-board">
      {/* celular e tablet: abas com contagem */}
      <div className="flex flex-col gap-3 lg:hidden">
        <div role="tablist" aria-label={t("tabsLabel")} className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {stages.map((s) => {
            const selected = s === current;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                id={`stage-tab-${s}`}
                aria-selected={selected}
                aria-controls={`stage-panel-${s}`}
                onClick={() => setCurrent(s)}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  selected ? "border-accent/40 bg-accent-soft text-accent-text" : "border-border bg-surface text-fg-muted hover:bg-surface-hover",
                )}
                data-testid={`stage-tab-${s}`}
              >
                {t(`stages.${s}`)}
                <span className={cn("rounded-full px-1.5 font-mono text-xs", selected ? "bg-accent/15" : "bg-surface-hover")}>{columns[s].length}</span>
              </button>
            );
          })}
        </div>
        <div role="tabpanel" id={`stage-panel-${current}`} aria-labelledby={`stage-tab-${current}`} className="flex flex-col gap-2">
          <p className="type-caption text-fg-muted">{t(`stageHints.${current}`)}</p>
          <CardList items={columns[current]} empty={t("empty")} />
        </div>
      </div>
      {/* desktop: colunas */}
      <div className="hidden gap-3 lg:grid lg:grid-cols-5">
        {stages.map((s) => (
          <section key={s} aria-labelledby={`stage-col-${s}`} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-surface-elevated p-3" data-testid={`stage-col-${s}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 id={`stage-col-${s}`} className="text-sm font-semibold text-fg">
                {t(`stages.${s}`)}
              </h2>
              <Badge size="sm" variant={columns[s].length > 0 ? "accent" : "neutral"}>
                {columns[s].length}
              </Badge>
            </div>
            <p className="type-caption text-fg-muted">{t(`stageHints.${s}`)}</p>
            <CardList items={columns[s]} empty={t("empty")} />
          </section>
        ))}
      </div>
    </div>
  );
}
