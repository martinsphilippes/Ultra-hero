"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormField, Select } from "@/components/ui";
import { LibraryTabsEditor, type LibraryTabEditorRow } from "./LibraryTabsEditor";

export type CategoryTabsOption = { id: string; name: string; isActive: boolean; rows: LibraryTabEditorRow[] };

type Props = { categories: CategoryTabsOption[]; initialId?: string | null };

// Atalhos por categoria (0050): escolhe a categoria e edita os 7 atalhos dela.
export function CategoryLibraryTabsPanel({ categories, initialId }: Props) {
  const t = useTranslations("adminContent.heroCategories.tabs");
  const [selected, setSelected] = useState(categories.find((c) => c.id === initialId)?.id ?? categories[0]?.id ?? "");
  const current = categories.find((c) => c.id === selected);

  if (categories.length === 0) return <p className="text-sm text-fg-muted">{t("noCategories")}</p>;

  return (
    <div className="flex flex-col gap-4">
      <FormField label={t("categoryPick")} className="max-w-sm">
        <Select value={selected} onChange={(e) => setSelected(e.target.value)} data-testid="category-tabs-select">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.isActive ? c.name : `${c.name} (${t("inactiveCategory")})`}
            </option>
          ))}
        </Select>
      </FormField>
      {/* key: troca de categoria ou dados novos do servidor recriam o editor */}
      {current ? <LibraryTabsEditor key={`${current.id}:${JSON.stringify(current.rows)}`} mode="category" targetId={current.id} rows={current.rows} /> : null}
    </div>
  );
}
