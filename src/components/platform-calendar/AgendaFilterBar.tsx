"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { SegmentedControl, Select } from "@/components/ui";
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

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3" data-testid="agenda-filter-bar" aria-busy={pending}>
      {showMode ? (
        <SegmentedControl<AgendaMode>
          aria-label={t("mode")}
          size="sm"
          className="w-full"
          value={filters.mode}
          onValueChange={(v) => go({ cal: v })}
          options={[
            { value: "all", label: t("all") },
            { value: "groscove", label: t("groscove") },
            { value: "mine", label: t("mine") },
          ]}
        />
      ) : null}
      {filters.mode !== "mine" ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            {t("territory")}
            <Select selectSize="sm" value={filters.territory ?? ""} onChange={(e) => go({ territorio: e.target.value })} data-testid="agenda-territory">
              <option value="">{t("allTerritories")}</option>
              {TERRITORIES.map((k) => (
                <option key={k} value={k}>
                  {tt(k)}
                </option>
              ))}
            </Select>
          </label>
          {collections.length > 1 || filters.collection ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
              {t("collection")}
              <Select selectSize="sm" value={filters.collection ?? ""} onChange={(e) => go({ colecao: e.target.value })} data-testid="agenda-collection">
                <option value="">{t("allCollections")}</option>
                {collections.map((c) => (
                  <option key={c} value={c}>
                    {collectionLabel(c)}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
