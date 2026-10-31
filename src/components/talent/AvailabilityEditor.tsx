"use client";

import { CalendarPlus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Badge, Button, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import type { AvailabilityRow } from "@/lib/deals/queries";
import { AVAILABILITY_KINDS } from "@/lib/deals/vocab";
import { deleteAvailabilityAction, saveAvailabilityAction } from "@/lib/talent/actions";

type Props = { portal: "agency" | "office"; talentId: string; rows: AvailabilityRow[]; canEdit: boolean };

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Disponibilidade comercial: períodos em que o creator aceita propostas e períodos bloqueados. É o que a
// marca vê no catálogo (nunca a agenda privada). Mesmo editor no escritório e na ficha do casting.
export function AvailabilityEditor({ portal, talentId, rows, canEdit }: Props) {
  const t = useTranslations("talent.availability");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [kind, setKind] = useState<"available" | "blocked">("available");
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState(today());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!startsOn || !endsOn || endsOn < startsOn) return setError(t("invalidRange"));
    start(async () => {
      const result = await saveAvailabilityAction(portal, { talentId, id: null, kind, startsOn, endsOn, note: note.trim() });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setNote("");
    });
  }

  function remove(id: string) {
    if (!window.confirm(t("confirmDelete"))) return;
    start(async () => {
      const result = await deleteAvailabilityAction(portal, { talentId, id });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="availability-editor">
      <p className="type-body-sm text-fg-muted">{t("hint")}</p>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
              <Badge size="sm" variant={r.kind === "available" ? "success" : "neutral"}>
                {t(`kinds.${r.kind}`)}
              </Badge>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium text-fg">
                  {formatPlainDate(r.startsOn, locale)} – {formatPlainDate(r.endsOn, locale)}
                </span>
                {r.note ? <span className="type-caption text-fg-muted">{r.note}</span> : null}
              </span>
              {canEdit ? (
                <Button type="button" size="sm" variant="ghost" leadingIcon={<Trash2 />} onClick={() => remove(r.id)} disabled={pending} aria-label={t("deleteLabel", { start: formatPlainDate(r.startsOn, locale) })}>
                  <span className="sr-only sm:not-sr-only">{t("delete")}</span>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[10rem_1fr_1fr_2fr_auto]" noValidate>
          <FormField label={t("kind")}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} disabled={pending}>
              {AVAILABILITY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kinds.${k}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t("startsOn")} required>
            <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} disabled={pending} />
          </FormField>
          <FormField label={t("endsOn")} required>
            <Input type="date" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} disabled={pending} />
          </FormField>
          <FormField label={t("note")} hint={t("noteHint")}>
            <Textarea value={note} maxLength={200} rows={1} onChange={(e) => setNote(e.target.value)} disabled={pending} />
          </FormField>
          <div className="flex items-end">
            <Button type="submit" size="sm" leadingIcon={<CalendarPlus />} loading={pending} data-testid="availability-add">
              {t("add")}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="type-body-sm text-danger sm:col-span-2 lg:col-span-5">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
