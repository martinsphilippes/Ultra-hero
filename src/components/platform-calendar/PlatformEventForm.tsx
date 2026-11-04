"use client";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button, Checkbox, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import { savePlatformEventAction } from "@/lib/platform-calendar/actions";
import type { PlatformFormValues } from "@/lib/platform-calendar/form";
import { PLATFORM_TIMEZONES, TERRITORIES } from "@/lib/platform-calendar/vocab";

type Props = { initial: PlatformFormValues };

// Criar/editar evento do Calendário Groscove (admin, 0098). Estado: rascunho (só o admin vê), publicar agora, ou
// programar (aparece sozinho na data, sem cron). Cancelado continua cancelado ao salvar (reativar = publicar).
export function PlatformEventForm({ initial }: Props) {
  const t = useTranslations("groscoveCalendar.form");
  const tg = useTranslations("groscoveCalendar");
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof PlatformFormValues>(key: K, value: PlatformFormValues[K]) => setV((x) => ({ ...x, [key]: value }));
  const timezones = PLATFORM_TIMEZONES.includes(v.timezone as (typeof PLATFORM_TIMEZONES)[number]) ? PLATFORM_TIMEZONES : [v.timezone, ...PLATFORM_TIMEZONES];

  function submit(event: FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await savePlatformEventAction({ ...v, territory: v.territory || "" });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
      if (result.ok && result.id) router.push(`/admin/agenda/${result.id}`);
      else if (result.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4" data-testid="platform-event-form">
      <FormField label={t("title")} required>
        <Input value={v.title} maxLength={160} onChange={(e) => set("title", e.target.value)} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("territory")}>
          <Select value={v.territory} onChange={(e) => set("territory", e.target.value as PlatformFormValues["territory"])}>
            <option value="">{tg("noTerritory")}</option>
            {TERRITORIES.map((k) => (
              <option key={k} value={k}>
                {tg(`territories.${k}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("category")} optionalLabel={t("optional")}>
          <Input value={v.category} maxLength={60} onChange={(e) => set("category", e.target.value)} />
        </FormField>
      </div>
      <Checkbox label={t("allDay")} checked={v.allDay} onChange={(e) => set("allDay", e.target.checked)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("date")} required>
          <Input type="date" value={v.date} onChange={(e) => set("date", e.target.value)} />
        </FormField>
        <FormField label={t("endDate")} optionalLabel={t("optional")} hint={t("endDateHint")}>
          <Input type="date" value={v.endDate} min={v.date} onChange={(e) => set("endDate", e.target.value)} />
        </FormField>
        {!v.allDay ? (
          <>
            <FormField label={t("startTime")}>
              <Input type="time" value={v.startTime} onChange={(e) => set("startTime", e.target.value)} />
            </FormField>
            <FormField label={t("endTime")}>
              <Input type="time" value={v.endTime} onChange={(e) => set("endTime", e.target.value)} />
            </FormField>
          </>
        ) : null}
        <FormField label={t("timezone")}>
          <Select value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {timezones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("location")} optionalLabel={t("optional")}>
          <Input value={v.location} maxLength={200} onChange={(e) => set("location", e.target.value)} />
        </FormField>
      </div>
      <FormField label={t("description")} optionalLabel={t("optional")}>
        <Textarea value={v.description} maxLength={2000} rows={4} onChange={(e) => set("description", e.target.value)} />
      </FormField>
      <FormField label={t("hashtags")} optionalLabel={t("optional")} hint={t("hashtagsHint")}>
        <Input value={v.hashtags} onChange={(e) => set("hashtags", e.target.value)} />
      </FormField>
      <div className="flex flex-col gap-2">
        <Checkbox label={tg("highlight")} checked={v.highlight} onChange={(e) => set("highlight", e.target.checked)} />
        <Checkbox label={tg("tentative")} description={t("tentativeHint")} checked={v.tentative} onChange={(e) => set("tentative", e.target.checked)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label={t("status")}>
          <Select value={v.status} onChange={(e) => set("status", e.target.value as PlatformFormValues["status"])} data-testid="platform-status">
            {initial.status === "cancelled" ? <option value="cancelled">{tg("status.cancelled")}</option> : null}
            <option value="draft">{tg("status.draft")}</option>
            <option value="published">{initial.status === "cancelled" ? t("reactivate") : t("publishNow")}</option>
            <option value="scheduled">{tg("status.scheduled")}</option>
          </Select>
        </FormField>
        {v.status === "scheduled" ? (
          <>
            <FormField label={t("publishDate")} required>
              <Input type="date" value={v.publishDate} onChange={(e) => set("publishDate", e.target.value)} />
            </FormField>
            <FormField label={t("publishTime")}>
              <Input type="time" value={v.publishTime} onChange={(e) => set("publishTime", e.target.value)} />
            </FormField>
          </>
        ) : null}
      </div>
      <Button type="submit" size="lg" leadingIcon={<Save />} disabled={pending} className="w-full sm:w-fit" data-testid="platform-save">
        {t("save")}
      </Button>
    </form>
  );
}
