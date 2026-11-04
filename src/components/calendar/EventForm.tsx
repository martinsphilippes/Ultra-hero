"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Button, Checkbox, DateRangePicker, Dialog, EntitySelect, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import { saveEventAction } from "@/lib/calendar/actions";
import { MANUAL_EVENT_KINDS, type EventInput, type ManualEventKind } from "@/lib/calendar/vocab";
import { brandOption, dealOption, talentOption, type TalentPickFields } from "@/lib/ui/entity";

/** Opção das listas do formulário; os campos extras alimentam o cartão abaixo da caixa (negócio: marca e logo). */
export type EventOption = { id: string; name: string; brand?: string | null; logoUrl?: string | null } & TalentPickFields;
export type EventFormOptions = {
  /** Negócio fixo (ficha do negócio) ou lista para escolher (agenda). */
  fixedDealId?: string | null;
  deals?: EventOption[];
  talents?: EventOption[];
  brands?: EventOption[];
  canPublishCommercialDate: boolean;
  /** Colaborador: só eventos ligados a um negócio dele. */
  dealRequired?: boolean;
};
type Props = EventFormOptions & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Valores iniciais: compromisso novo (newEventDefaults) ou o salvo, para editar (eventToInput; id preenchido). */
  initial: EventInput;
};

// Evento manual da agência: reunião, gravação, outro ou data comercial (gestor+). A agência escolhe se a
// marca e/ou o creator veem. Data comercial é sempre visível às marcas atendidas (ou a uma marca).
// 0086: o mesmo diálogo cria e edita (id preenchido). Quem abre é o EventEditorProvider (EventEditor.tsx); o
// componente é remontado a cada abertura (key), então o estado sempre começa dos valores iniciais.
export function EventFormDialog({ open, onOpenChange, initial, fixedDealId = null, deals = [], talents = [], brands = [], canPublishCommercialDate, dealRequired = false }: Props) {
  const t = useTranslations("agency.agenda.form");
  const tdp = useTranslations("common.datePicker");
  const tk = useTranslations("commercial.eventKinds");
  const tp = useTranslations("pickers");
  const { toast } = useToast();
  const [v, setV] = useState<EventInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof EventInput>(k: K, value: EventInput[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const commercial = v.kind === "commercial_date";
  const editing = Boolean(initial.id);
  // data comercial não vira outro tipo (a RPC recusa); um compromisso pode virar data comercial só para gestor+
  const kindLocked = editing && initial.kind === "commercial_date";
  const kindOptions = MANUAL_EVENT_KINDS.filter((k) => k !== "commercial_date" || canPublishCommercialDate || initial.kind === "commercial_date");

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!v.title.trim()) return setError(t("titleRequired"));
    if (dealRequired && !v.dealId) return setError(t("dealRequired"));
    start(async () => {
      const result = await saveEventAction(commercial ? { ...v, dealId: "", talentId: "", visibleToBrand: true, visibleToTalent: false } : v);
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={editing ? t("editTitle") : t("title")} description={editing ? t("editHint") : t("hint")} size="lg">
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate data-testid="event-form" data-mode={editing ? "edit" : "new"}>
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <FormField label={t("kind")}>
            <Select value={v.kind} onChange={(e) => set("kind", e.target.value as ManualEventKind)} disabled={pending || kindLocked}>
              {kindOptions.map((k) => (
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
          <FormField label={tdp("period")} required className="sm:col-span-2">
            <DateRangePicker start={v.date} end={v.endDate} onChange={(a, b) => setV((cur) => ({ ...cur, date: a, endDate: b }))} disabled={pending} data-testid="event-period" />
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
              <FormField label={t("deal")} hint={tp(dealRequired ? "hints.eventDealRequired" : "hints.eventDeal")} required={dealRequired}>
                <EntitySelect
                  value={v.dealId}
                  onChange={(e) => setV((cur) => ({ ...cur, dealId: e.target.value, visibleToBrand: e.target.value ? cur.visibleToBrand : false }))}
                  disabled={pending}
                  emptyLabel="—"
                  emptyCard={dealRequired ? undefined : tp("empty.noDeal")}
                  roleInOption={false}
                  options={deals.map((d) => dealOption(tp, d))}
                />
              </FormField>
            )}
            <FormField label={t("talent")} hint={tp("hints.eventTalent")}>
              <EntitySelect
                value={v.talentId}
                onChange={(e) => setV((cur) => ({ ...cur, talentId: e.target.value, visibleToTalent: e.target.value ? cur.visibleToTalent : false }))}
                disabled={pending}
                emptyLabel="—"
                emptyCard={tp("empty.noTalent")}
                roleInOption={false}
                options={talents.map((x) => talentOption(tp, x))}
              />
            </FormField>
          </div>
        ) : brands.length > 0 ? (
          <FormField label={t("brand")} hint={tp("hints.eventBrand")}>
            <EntitySelect value={v.brandId} onChange={(e) => set("brandId", e.target.value)} disabled={pending} emptyLabel={t("allBrands")} emptyCard={tp("empty.allBrands")} roleInOption={false} options={brands.map((b) => brandOption(tp, { id: b.id, name: b.name, logoUrl: b.logoUrl }))} />
          </FormField>
        ) : null}
        <FormField label={t("location")}>
          <Input value={v.location} maxLength={200} onChange={(e) => set("location", e.target.value)} disabled={pending} />
        </FormField>
        <FormField label={t("description")} hint={t("descriptionHint")}>
          <Textarea value={v.description} maxLength={2000} rows={3} onChange={(e) => set("description", e.target.value)} disabled={pending} />
        </FormField>
        {!commercial ? (
          // bloco 9: cada opção é uma linha inteira tocável (44px+); sem negócio/creator fica esmaecida e diz o que
          // falta logo embaixo, e habilita assim que a escolha é feita acima (o estado é o mesmo do formulário)
          <div className="flex flex-col gap-1" data-testid="event-visibility">
            <Checkbox
              label={t("visibleToBrand")}
              description={v.dealId ? undefined : t("visibleToBrandNeedsDeal")}
              checked={v.visibleToBrand}
              onChange={(e) => set("visibleToBrand", e.target.checked)}
              disabled={pending || !v.dealId}
              data-testid="event-visible-brand"
            />
            <Checkbox
              label={t("visibleToTalent")}
              description={v.talentId ? undefined : t("visibleToTalentNeedsTalent")}
              checked={v.visibleToTalent}
              onChange={(e) => set("visibleToTalent", e.target.checked)}
              disabled={pending || !v.talentId}
              data-testid="event-visible-talent"
            />
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
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("back")}
          </Button>
          <Button type="submit" loading={pending} data-testid="event-save">
            {commercial ? t("publish") : t("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
