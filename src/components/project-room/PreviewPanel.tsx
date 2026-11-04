"use client";

import { Eye, EyeOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge, Button, DatePicker, FormField, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { ExecDeliverable } from "@/lib/execution/queries";
import { setPreviewAction, setPreviewDateAction } from "@/lib/project-room/actions";
import type { DealPreview } from "@/lib/project-room/queries";

type Props = { dealId: string; deliverables: ExecDeliverable[]; previews: DealPreview[]; canEdit: boolean };

// Prévia (o "Demo" do PDF; 0110, D9): data combinada da prévia por entrega e marcar a versão enviada como prévia. A
// aprovação é a de sempre (a marca aprova ou pede ajuste na versão); a prévia aprovada entra no clipping.
export function PreviewPanel({ dealId, deliverables, previews, canEdit }: Props) {
  const t = useTranslations("projectRoom.preview");
  const tk = useTranslations("commercial.deliverableKinds");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [dates, setDates] = useState<Record<string, string>>(() => Object.fromEntries(previews.map((p) => [p.deliverableId, p.previewOn ?? ""])));
  const [pending, start] = useTransition();
  const marked = new Set(previews.flatMap((p) => p.versionIds));
  const list = deliverables.filter((d) => d.status !== "cancelled");

  function run(fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    start(async () => {
      const result = await fn();
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  if (list.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="preview-panel">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-fg">{t("title")}</h3>
        <p className="type-caption text-fg-muted">{t("hint")}</p>
      </div>
      {list.map((d) => {
        const subs = d.versions.filter((v) => v.kind === "submission");
        return (
          <div key={d.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <p className="text-sm font-medium text-fg">
              {d.title || tk(d.kind)} · <span className="text-fg-muted">{d.talentName}</span>
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <FormField label={t("date")} className="sm:max-w-xs">
                <DatePicker value={dates[d.id] ?? ""} onChange={(v) => setDates((cur) => ({ ...cur, [d.id]: v }))} disabled={!canEdit || pending} />
              </FormField>
              {canEdit ? (
                <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => setPreviewDateAction({ dealId, deliverableId: d.id, date: dates[d.id] ?? "" }))}>
                  {t("saveDate")}
                </Button>
              ) : null}
            </div>
            {subs.length === 0 ? <p className="type-caption text-fg-muted">{t("noVersions")}</p> : null}
            <ul className="flex flex-col gap-1">
              {subs.map((v) => {
                const on = marked.has(v.id);
                return (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 type-caption text-fg-muted">
                    <span className="text-fg">{t("version", { n: v.revision })}</span>· {formatDateTime(v.submittedAt, locale)}
                    {on ? <Badge size="sm" variant="info">{t("badge")}</Badge> : null}
                    {v.decision ? <Badge size="sm" variant={v.decision === "approved" ? "success" : "warning"}>{t(`decision.${v.decision}`)}</Badge> : null}
                    {canEdit ? (
                      <Button type="button" size="sm" variant="ghost" className="min-h-11" leadingIcon={on ? <EyeOff /> : <Eye />} disabled={pending} onClick={() => run(() => setPreviewAction({ dealId, versionId: v.id, preview: !on }))} data-testid="preview-toggle">
                        {on ? t("unmark") : t("mark")}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
