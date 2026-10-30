"use client";

import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { resetCreatorLibraryOverrideAction, saveCategoryLibraryTabsAction, saveCreatorLibraryOverridesAction } from "@/app/admin/hero-categories/actions";
import { LIBRARY_ICONS } from "@/components/discover/personalities/library-icons";
import { Badge, Button, FormField, IconButton, Input, Select, Switch, useToast } from "@/components/ui";
import { LIBRARY_ICON_KEYS, LIBRARY_LABEL_MAX, duplicateLabels, type LibraryIconKey, type LibraryTabEditorRow } from "@/lib/heroes/library-tabs";
import { ActionButton } from "./ActionButton";

export type { LibraryTabEditorRow };

type Props =
  | { mode: "category"; targetId: string; rows: LibraryTabEditorRow[] }
  | { mode: "hero"; targetId: string; rows: LibraryTabEditorRow[]; inheritedFrom: string | null };

// Editor dos 7 atalhos da página do herói (0050): rótulo pt-BR/en/es, ícone da lista fixa, ordem
// (subir/descer) e visível. Salva tudo numa ação só. No herói, só o que difere do herdado vira exceção.
export function LibraryTabsEditor(props: Props) {
  const { mode, targetId } = props;
  const t = useTranslations("adminContent.heroCategories.tabs");
  const tc = useTranslations("adminContent.common");
  const tl = useTranslations("discover.personalities.libraries.labels");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState(props.rows);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(rows) !== JSON.stringify(props.rows);
  const dupes = useMemo(() => duplicateLabels(rows.map((r) => ({ visible: r.isVisible, text: r.label["pt-BR"].trim() || r.fallbackLabel }))), [rows]);
  const anyOverride = props.rows.some((r) => r.overridden);

  function update(index: number, patch: Partial<LibraryTabEditorRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function move(index: number, direction: -1 | 1) {
    setRows((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function save() {
    setError(null);
    const payload = rows.map(({ key, label, icon, isVisible }) => ({ key, label, icon, isVisible }));
    startTransition(async () => {
      const result = mode === "category" ? await saveCategoryLibraryTabsAction(targetId, payload) : await saveCreatorLibraryOverridesAction(targetId, payload);
      if (result.ok) {
        toast({ title: result.message ?? tc("saved"), variant: "success" });
        router.refresh();
      } else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid={mode === "category" ? "category-tabs-editor" : "hero-tabs-editor"}>
      {mode === "hero" ? (
        <p className="type-body-sm text-fg-muted" data-testid="hero-tabs-inherited">
          {props.inheritedFrom ? t("inheritedFrom", { category: props.inheritedFrom }) : t("noCategory")}
        </p>
      ) : null}
      <p className="type-caption text-fg-muted">{t("rules")}</p>

      <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface" aria-label={t("listLabel")}>
        {rows.map((row, index) => {
          const Icon = LIBRARY_ICONS[row.icon];
          const shown = row.label["pt-BR"].trim() || row.fallbackLabel;
          const source = tl(row.key);
          return (
            <li key={row.key} className="flex flex-col gap-3 p-3" data-testid="library-tab-row" data-source={row.key}>
              <div className="flex flex-wrap items-center gap-2">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated text-fg">
                  <Icon className="size-4" />
                </span>
                <span className="font-medium text-fg" data-testid="library-tab-label">
                  {shown}
                </span>
                <span className="text-xs text-fg-muted">{t("source", { source })}</span>
                {!row.isVisible ? (
                  <Badge size="sm" variant="neutral">
                    {t("hidden")}
                  </Badge>
                ) : null}
                {mode === "hero" ? (
                  <Badge size="sm" variant={row.overridden ? "warning" : "neutral"} data-testid="library-tab-origin">
                    {row.overridden ? t("overridden") : t("inherited")}
                  </Badge>
                ) : null}
                <div className="ml-auto flex items-center gap-1">
                  <IconButton icon={<ArrowUp />} label={`${tc("moveUp")} · ${shown}`} size="sm" onClick={() => move(index, -1)} disabled={index === 0 || pending} />
                  <IconButton icon={<ArrowDown />} label={`${tc("moveDown")} · ${shown}`} size="sm" onClick={() => move(index, 1)} disabled={index === rows.length - 1 || pending} />
                  {mode === "hero" && row.overridden ? (
                    <ActionButton action={() => resetCreatorLibraryOverrideAction(targetId, row.key)} variant="ghost" icon={<RotateCcw />} label={`${t("reset")} · ${shown}`} disabled={pending} />
                  ) : null}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField label={t("labelPt")} hint={t(mode === "category" ? "labelHintDefault" : "labelHintInherit", { label: row.fallbackLabel })}>
                  <Input value={row.label["pt-BR"]} placeholder={row.fallbackLabel} maxLength={LIBRARY_LABEL_MAX} onChange={(e) => update(index, { label: { ...row.label, "pt-BR": e.target.value } })} />
                </FormField>
                <FormField label={t("labelEn")} hint={t("labelFallback")}>
                  <Input value={row.label.en} maxLength={LIBRARY_LABEL_MAX} onChange={(e) => update(index, { label: { ...row.label, en: e.target.value } })} />
                </FormField>
                <FormField label={t("labelEs")} hint={t("labelFallback")}>
                  <Input value={row.label.es} maxLength={LIBRARY_LABEL_MAX} onChange={(e) => update(index, { label: { ...row.label, es: e.target.value } })} />
                </FormField>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <FormField label={t("icon")} className="min-w-44">
                  <Select value={row.icon} onChange={(e) => update(index, { icon: e.target.value as LibraryIconKey })} selectSize="sm">
                    {LIBRARY_ICON_KEYS.map((icon) => (
                      <option key={icon} value={icon}>
                        {t(`icons.${icon}`)}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <Switch id={`tab-visible-${mode}-${row.key}`} checked={row.isVisible} onCheckedChange={(checked) => update(index, { isVisible: checked })}
                  label={t("visible")}
                  aria-label={`${t("visible")} · ${shown}`}
                  size="sm"
                />
              </div>
            </li>
          );
        })}
      </ol>

      {dupes.length > 0 ? (
        <p role="status" className="rounded-xl border border-dashed border-warning/40 bg-warning-soft/40 p-3 text-sm text-fg" data-testid="library-tabs-duplicate">
          {t("duplicate", { labels: dupes.join(", ") })}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={save} loading={pending} disabled={!dirty}>
          {t("save")}
        </Button>
        {dirty ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setRows(props.rows)} disabled={pending}>
            {tc("cancel")}
          </Button>
        ) : null}
        {mode === "hero" && anyOverride ? (
          <ActionButton action={() => resetCreatorLibraryOverrideAction(targetId, null)} variant="ghost" disabled={pending}>
            {t("resetAll")}
          </ActionButton>
        ) : null}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
