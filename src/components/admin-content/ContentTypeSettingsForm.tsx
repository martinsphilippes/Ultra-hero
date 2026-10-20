"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveContentTypeSettingsAction } from "@/app/admin/content-actions";
import { Button, Input, Select, useToast } from "@/components/ui";

type Row = { type: "video" | "recipe" | "workout" | "guide" | "article"; default_completion_mode: "manual" | "auto"; auto_threshold_pct: number };

// Tabela editável dos padrões de conclusão por tipo (content_type_settings).
export function ContentTypeSettingsForm({ rows: initialRows }: { rows: Row[] }) {
  const t = useTranslations("adminContent.content.typeSettings");
  const tc = useTranslations("adminContent.common");
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update(type: Row["type"], patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.type === type ? { ...r, ...patch } : r)));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveContentTypeSettingsAction(rows);
      if (result.ok) {
        toast({ title: result.message ?? tc("saved"), variant: "success" });
        router.refresh();
      } else setError(result.error);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead className="bg-surface-elevated">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-fg-muted">{t("type")}</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-fg-muted">{t("mode")}</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-fg-muted">{t("threshold")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.type}>
                <th scope="row" className="px-4 py-3 text-left font-medium text-fg">{tc(`types.${row.type}`)}</th>
                <td className="px-4 py-2">
                  <Select
                    aria-label={`${t("mode")} · ${tc(`types.${row.type}`)}`}
                    selectSize="sm"
                    value={row.default_completion_mode}
                    onChange={(e) => update(row.type, { default_completion_mode: e.target.value as Row["default_completion_mode"] })}
                  >
                    <option value="manual">{tc("completionMode.manual")}</option>
                    <option value="auto">{tc("completionMode.auto")}</option>
                  </Select>
                </td>
                <td className="px-4 py-2">
                  <Input
                    aria-label={`${t("threshold")} · ${tc(`types.${row.type}`)}`}
                    type="number"
                    min={1}
                    max={100}
                    inputSize="sm"
                    className="w-24"
                    value={row.auto_threshold_pct}
                    disabled={row.default_completion_mode !== "auto"}
                    onChange={(e) => update(row.type, { auto_threshold_pct: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="type-caption text-fg-muted">{t("thresholdHint")}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" loading={pending}>
          {tc("save")}
        </Button>
      </div>
    </form>
  );
}
