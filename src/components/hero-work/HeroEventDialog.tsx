"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Button, Checkbox, DatePicker, DateTimePicker, Dialog, EntitySelect, FormField, IconButton, Input, Select, Textarea, useToast } from "@/components/ui";
import { joinDateTime, splitDateTime } from "@/lib/calendar/date-picker";
import { saveHeroEventAction } from "@/lib/hero-work/actions";
import { HERO_EVENT_KINDS, MAX_CHECKLIST_ITEMS, type HeroEventInput, type HeroEventKind } from "@/lib/hero-work/vocab";

export type ServiceOption = { id: string; title: string; client: string; serviceOn: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Valores iniciais (novo: newHeroEventDefaults; editar: heroEventToInput). Remonta a cada abertura (key). */
  initial: HeroEventInput;
  /** Serviços do financeiro para vincular (só o titular os lê). */
  services: ServiceOption[];
};

// Compromisso do herói: tipo, título, quando (data/hora início e fim, ou dia inteiro), local, contratante, serviço
// vinculado (opcional), observações e o que executar em checklist. O mesmo diálogo cria e edita (id preenchido).
export function HeroEventDialog({ open, onOpenChange, initial, services }: Props) {
  const t = useTranslations("heroWork.agenda.form");
  const tk = useTranslations("heroWork.kinds");
  const { toast } = useToast();
  const [v, setV] = useState<HeroEventInput>(initial);
  const [startAt, setStartAt] = useState(() => (initial.allDay ? "" : joinDateTime(initial.date, initial.startTime)));
  const [endAt, setEndAt] = useState(() => (initial.allDay ? "" : joinDateTime(initial.endDate || initial.date, initial.endTime)));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof HeroEventInput>(k: K, value: HeroEventInput[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const editing = Boolean(initial.id);
  const checklist = v.checklist ?? [];

  function toggleAllDay(on: boolean) {
    if (on) {
      set("allDay", true);
    } else {
      // volta a ter hora: parte das datas que já estavam escolhidas
      setStartAt(joinDateTime(v.date, v.startTime || "09:00"));
      setEndAt(joinDateTime(v.endDate || v.date, v.endTime || "10:00", "10:00"));
      set("allDay", false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!v.title.trim()) return setError(t("titleRequired"));
    let payload: HeroEventInput = { ...v, checklist: checklist.filter((i) => i.text.trim() !== "") };
    if (!v.allDay) {
      const s = splitDateTime(startAt);
      const e = splitDateTime(endAt || startAt);
      if (!s.date) return setError(t("dateRequired"));
      payload = { ...payload, date: s.date, startTime: s.time || "09:00", endDate: e.date && e.date !== s.date ? e.date : "", endTime: e.time || s.time || "09:00" };
      if (endAt && endAt < startAt) return setError(t("endBeforeStart"));
    } else if (!v.date) {
      return setError(t("dateRequired"));
    } else if (v.endDate && v.endDate < v.date) {
      return setError(t("endBeforeStart"));
    }
    start(async () => {
      const result = await saveHeroEventAction(payload);
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={editing ? t("editTitle") : t("title")} description={t("hint")} size="lg">
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate data-testid="hero-event-form" data-mode={editing ? "edit" : "new"}>
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <FormField label={t("kind")}>
            <Select value={v.kind} onChange={(e) => set("kind", e.target.value as HeroEventKind)} disabled={pending}>
              {HERO_EVENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {tk(k)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t("eventTitle")} required>
            <Input value={v.title} maxLength={160} onChange={(e) => set("title", e.target.value)} disabled={pending} data-testid="hero-event-title" />
          </FormField>
        </div>
        <Checkbox label={t("allDay")} checked={v.allDay} onChange={(e) => toggleAllDay(e.target.checked)} disabled={pending} />
        {v.allDay ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t("date")} required>
              <DatePicker value={v.date} onChange={(value) => set("date", value)} disabled={pending} required data-testid="hero-event-date" />
            </FormField>
            <FormField label={t("endDate")}>
              <DatePicker value={v.endDate} min={v.date} onChange={(value) => set("endDate", value)} disabled={pending} />
            </FormField>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t("startsAt")} required>
              <DateTimePicker
                value={startAt}
                onChange={(value) => {
                  setStartAt(value);
                  // fim acompanha o início enquanto estava junto (mesmo dia, 1 hora depois do padrão)
                  if (!endAt || endAt < value) setEndAt(value);
                }}
                disabled={pending}
                required
                data-testid="hero-event-start"
              />
            </FormField>
            <FormField label={t("endsAt")}>
              <DateTimePicker value={endAt} min={startAt} onChange={setEndAt} disabled={pending} data-testid="hero-event-end" />
            </FormField>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t("location")}>
            <Input value={v.location} maxLength={200} onChange={(e) => set("location", e.target.value)} disabled={pending} />
          </FormField>
          <FormField label={t("client")} hint={t("clientHint")}>
            <Input value={v.client} maxLength={120} onChange={(e) => set("client", e.target.value)} disabled={pending} />
          </FormField>
        </div>
        {services.length > 0 ? (
          <FormField label={t("service")} hint={t("serviceHint")}>
            <EntitySelect
              value={v.serviceId}
              onChange={(e) => set("serviceId", e.target.value)}
              disabled={pending}
              emptyLabel={t("noService")}
              roleInOption={false}
              options={services.map((s) => ({ value: s.id, name: s.title, detail: s.client }))}
            />
          </FormField>
        ) : null}
        <FormField label={t("notes")} hint={t("notesHint")}>
          <Textarea value={v.notes} maxLength={2000} rows={3} onChange={(e) => set("notes", e.target.value)} disabled={pending} />
        </FormField>
        <fieldset className="flex flex-col gap-2" data-testid="hero-checklist-editor">
          <legend className="text-sm font-medium text-fg">{t("checklist")}</legend>
          <p className="type-caption text-fg-muted">{t("checklistHint")}</p>
          {checklist.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={item.text}
                maxLength={200}
                aria-label={t("checklistItem", { n: i + 1 })}
                onChange={(e) => set("checklist", checklist.map((c, j) => (j === i ? { ...c, text: e.target.value } : c)))}
                disabled={pending}
                data-testid="hero-checklist-input"
              />
              <IconButton type="button" variant="ghost" label={t("removeItem", { n: i + 1 })} icon={<X />} onClick={() => set("checklist", checklist.filter((_, j) => j !== i))} disabled={pending} />
            </div>
          ))}
          {checklist.length < MAX_CHECKLIST_ITEMS ? (
            <Button type="button" variant="secondary" size="sm" className="w-fit" leadingIcon={<Plus />} onClick={() => set("checklist", [...checklist, { text: "", done: false }])} disabled={pending} data-testid="hero-checklist-add">
              {t("addItem")}
            </Button>
          ) : null}
        </fieldset>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("back")}
          </Button>
          <Button type="submit" loading={pending} data-testid="hero-event-save">
            {t("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
