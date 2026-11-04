"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button, SegmentedControl, Select } from "@/components/ui";
import { TERRITORIES, type AgendaFilters, type AgendaMode } from "@/lib/platform-calendar/vocab";
import { useCollectionLabel } from "./PlatformBadges";

type Props = {
  /** Rota da agenda (ex.: /heroi/agenda). */
  base: string;
  /** Mês em vista (YYYY-MM) e outros parâmetros que precisam continuar na URL (filtros da agência). */
  params: Record<string, string | undefined>;
  filters: AgendaFilters;
  collections: readonly string[];
  /** Sem "Só meus" (admin: a agenda dele é só o Calendário Groscove). */
  showMode?: boolean;
};

// Filtros da agenda para o Calendário Groscove (0098): "Tudo / Só Groscove / Só meus", território e coleção. Navega
// por URL (?cal=&territorio=&colecao=), como a troca de mês; nada é guardado.
// Enxuto no celular (pedido do responsável, 04/11): uma linha só (modo + botão "Filtros"); território e calendário
// abrem por baixo ao tocar em "Filtros", e o que estiver ativo aparece como etiqueta com "x" para limpar.
export function AgendaFilterBar({ base, params, filters, collections, showMode = true }: Props) {
  const t = useTranslations("groscoveCalendar.filters");
  const tt = useTranslations("groscoveCalendar.territories");
  const collectionLabel = useCollectionLabel();
  const router = useRouter();
  const [pending, start] = useTransition();

  function go(patch: Partial<{ cal: AgendaMode; territorio: string; colecao: string }>) {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) next.set(k, v);
    const merged = { cal: filters.mode, territorio: filters.territory ?? "", colecao: filters.collection ?? "", ...patch };
    if (merged.cal && merged.cal !== "all") next.set("cal", merged.cal);
    if (merged.territorio) next.set("territorio", merged.territorio);
    if (merged.colecao) next.set("colecao", merged.colecao);
    start(() => router.push(`${base}?${next.toString()}`));
  }

  const canFilter = filters.mode !== "mine";
  const showCollection = collections.length > 1 || !!filters.collection;
  const active = [
    filters.territory ? { key: "territorio" as const, name: tt(filters.territory as (typeof TERRITORIES)[number]) } : null,
    filters.collection ? { key: "colecao" as const, name: collectionLabel(filters.collection) } : null,
  ].filter((x): x is { key: "territorio" | "colecao"; name: string } => x !== null);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="flex flex-col gap-2" data-testid="agenda-filter-bar" aria-busy={pending}>
      <div className="flex items-center gap-2">
        {showMode ? (
          <SegmentedControl<AgendaMode>
            aria-label={t("mode")}
            size="sm"
            className="min-w-0 flex-1"
            value={filters.mode}
            onValueChange={(v) => go({ cal: v })}
            options={[
              { value: "all", label: t("all") },
              { value: "groscove", label: t("groscove") },
              { value: "mine", label: t("mine") },
            ]}
          />
        ) : (
          <span className="flex-1" />
        )}
        {canFilter ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            leadingIcon={<SlidersHorizontal />}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
            data-testid="agenda-filters-toggle"
            className="shrink-0"
          >
            {active.length > 0 ? t("moreActive", { count: active.length }) : t("more")}
          </Button>
        ) : null}
      </div>
      {canFilter && active.length > 0 && !open ? (
        <div className="flex flex-wrap gap-1.5">
          {active.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => go({ [a.key]: "" })}
              aria-label={t("clear", { name: a.name })}
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border bg-surface py-1 pr-2 pl-3 text-xs font-medium text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
            >
              {a.name}
              <X className="size-3.5 text-fg-muted" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
      {canFilter && open ? (
        <div id={panelId} className={`grid grid-cols-1 gap-2 ${showCollection ? "sm:grid-cols-2" : ""}`}>
          <Select aria-label={t("territory")} selectSize="sm" value={filters.territory ?? ""} onChange={(e) => go({ territorio: e.target.value })} data-testid="agenda-territory">
            <option value="">{t("allTerritories")}</option>
            {TERRITORIES.map((k) => (
              <option key={k} value={k}>
                {tt(k)}
              </option>
            ))}
          </Select>
          {showCollection ? (
            <Select aria-label={t("collection")} selectSize="sm" value={filters.collection ?? ""} onChange={(e) => go({ colecao: e.target.value })} data-testid="agenda-collection">
              <option value="">{t("allCollections")}</option>
              {collections.map((c) => (
                <option key={c} value={c}>
                  {collectionLabel(c)}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
