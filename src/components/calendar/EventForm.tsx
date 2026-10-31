"use client";

import { CalendarPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Button, Checkbox, Dialog, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import { saveEventAction } from "@/lib/calendar/actions";
import { MANUAL_EVENT_KINDS, type EventInput, type ManualEventKind } from "@/lib/calendar/vocab";

type Option = { id: string; name: string };
type Props = {
  /** Negócio fixo (ficha do negócio) ou lista para escolher (agenda). */
  fixedDealId?: string | null;
  deals?: Option[];
  talents?: Option[];
  brands?: Option[];
  canPublishCommercialDate: boolean;
  /** Colaborador: só eventos ligados a um negócio dele. */
  dealRequired?: boolean;
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Evento manual da agência: reunião, gravação, outro ou data comercial (gestor+). A agência escolhe se a
// marca e/ou o creator veem. Data comercial é sempre visível às marcas atendidas (ou a uma marca).
export function EventForm({ fixedDealId = null, deals = [], talents = [], brands = [], canPublishCommercialDate, dealRequired = false }: Props) {
  const t = useTranslations("agency.agenda.form");
  const tk = useTranslations("commercial.eventKinds");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const empty: EventInput = { id: null, kind: "meeting", title: "", description: "", location: "", date: today(), endDate: "", startTime: "09:00", endTime: "10:00", allDay: false, dealId: fixedDealId ?? "", talentId: "", brandId: "", visibleToBrand: false, visibleToTalent: false };
  const [v, setV] = useState<EventInput>(empty);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof EventInput>(k: K, value: EventInput[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const commercial = v.kind === "commercial_date";

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!v.title.trim()) return setError(t("titleRequired"));
    if (dealRequired && !v.dealId) return setError(t("dealRequired"));
    start(async () => {
      const result = await saveEventAction(commercial ? { ...v, dealId: "", talentId: "", visibleToBrand: true, visibleToTalent: false } : v);
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setV(empty);
      setOpen(false);
    });
  }

  return (
    <>
      <Button type="button" size="sm" leadingIcon={<CalendarPlus />} onClick={() => setOpen(true)} data-testid="event-new">
        {t("new")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={t("title")} description={t("hint")} size="lg">
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate data-testid="event-form">
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <FormField label={t("kind")}>
              <Select value={v.kind} onChange={(e) => set("kind", e.target.value as ManualEventKind)} disabled={pending}>
                {MANUAL_EVENT_KINDS.filter((k) => k !== "commercial_date" || canPublishCommercialDate).map((k) => (
                  <option key={k} value={k}>
                    {tk(k)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t("eventTitle")} required>
              <Input value={v.title} maxLength={160} onChange={(e) => set("title", e.target.value)} disabled={pending} />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label={t("date")} required>
              <Input type="date" value={v.date} onChange={(e) => set("date", e.target.value)} disabled={pending} />
            </FormField>
            <FormField label={t("endDate")}>
              <Input type="date" value={v.endDate} min={v.date} onChange={(e) => set("endDate", e.target.value)} disabled={pending} />
            </FormField>
            <FormField label={t("startTime")}>
              <Input type="time" value={v.startTime} onChange={(e) => set("startTime", e.target.value)} disabled={pending || v.allDay} />
            </FormField>
            <FormField label={t("endTime")}>
              <Input type="time" value={v.endTime} onChange={(e) => set("endTime", e.target.value)} disabled={pending || v.allDay} />
            </FormField>
          </div>
          <Checkbox label={t("allDay")} checked={v.allDay} onChange={(e) => set("allDay", e.target.checked)} disabled={pending} />
          {!commercial ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {fixedDealId ? null : (
                <FormField label={t("deal")} hint={dealRequired ? t("dealRequiredHint") : undefined} required={dealRequired}>
                  <Select value={v.dealId} onChange={(e) => set("dealId", e.target.value)} disabled={pending}>
                    <option value="">—</option>
                    {deals.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}
              <FormField label={t("talent")} hint={t("talentHint")}>
                <Select value={v.talentId} onChange={(e) => set("talentId", e.target.value)} disabled={pending}>
                  <option value="">—</option>
                  {talents.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          ) : brands.length > 0 ? (
            <FormField label={t("brand")} hint={t("brandHint")}>
              <Select value={v.brandId} onChange={(e) => set("brandId", e.target.value)} disabled={pending}>
                <option value="">{t("allBrands")}</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          <FormField label={t("location")}>
            <Input value={v.location} maxLength={200} onChange={(e) => set("location", e.target.value)} disabled={pending} />
          </FormField>
          <FormField label={t("description")} hint={t("descriptionHint")}>
            <Textarea value={v.description} maxLength={2000} rows={3} onChange={(e) => set("description", e.target.value)} disabled={pending} />
          </FormField>
          {!commercial ? (
            <div className="flex flex-wrap gap-4">
              <Checkbox label={t("visibleToBrand")} checked={v.visibleToBrand} onChange={(e) => set("visibleToBrand", e.target.checked)} disabled={pending || !v.dealId} />
              <Checkbox label={t("visibleToTalent")} checked={v.visibleToTalent} onChange={(e) => set("visibleToTalent", e.target.checked)} disabled={pending || !v.talentId} />
            </div>
          ) : (
            <p className="type-caption text-fg-muted">{t("commercialNote")}</p>
          )}
          {error ? (
            <p role="alert" className="type-body-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="submit" loading={pending} data-testid="event-save">
              {commercial ? t("publish") : t("save")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
