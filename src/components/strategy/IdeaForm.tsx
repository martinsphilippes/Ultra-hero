"use client";

import { Lightbulb, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Button, DatePicker, EntitySelect, FormField, Input, SegmentedControl, Select, Textarea, useToast } from "@/components/ui";
import { saveStrategyIdeaAction } from "@/lib/strategy/actions";
import type { BrandPick, EventOption, HeroPick, PickerOption } from "@/lib/strategy/queries";
import { segmentForHero } from "@/lib/strategy/vocab";
import { brandOption, talentOption } from "@/lib/ui/entity";

export type IdeaFormValues = {
  id: string;
  month: string;
  brandId: string;
  brandLabel: string;
  segmentId: string;
  talentId: string;
  calendarEventId: string;
  ideaOn: string;
  title: string;
  body: string;
};

type Target = "brand" | "prospect";

// Ideia de estratégia para marca (0111, D3): marca atendida ou empresa-alvo, Hero, segmento, data do Calendário
// Groscove e o texto. Mobile first: um campo por linha, alvos ≥ 44 px. A IA é opcional (sem chave, a equipe escreve).
// Marca e Hero têm busca pelo nome (caixa com lupa); escolher o Hero preenche o segmento em que ele está alocado
// (dá para trocar).
export function IdeaForm({
  initial,
  brands,
  segments,
  talents,
  events,
  aiStatus,
}: {
  initial: IdeaFormValues;
  brands: BrandPick[];
  segments: PickerOption[];
  talents: HeroPick[];
  events: EventOption[];
  aiStatus: "not_configured" | "ready";
}) {
  const t = useTranslations("strategy.form");
  const tp = useTranslations("pickers");
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = useState(initial);
  const [target, setTarget] = useState<Target>(initial.brandId || brands.length > 0 ? (initial.brandLabel && !initial.brandId ? "prospect" : "brand") : "prospect");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof IdeaFormValues>(k: K, value: IdeaFormValues[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const brandOptions = useMemo(() => brands.map((b) => brandOption(tp, { id: b.id, name: b.name, logoUrl: b.logoUrl })), [brands, tp]);
  const heroOptions = useMemo(
    () => talents.map((h) => talentOption(tp, { id: h.id, name: h.name, city: h.city, state: h.state, avatarUrl: h.photoUrl })),
    [talents, tp],
  );
  // segmentos do Hero escolhido que existem na lista (ativos)
  const heroSegments = (talentId: string) => (talents.find((h) => h.id === talentId)?.segmentIds ?? []).filter((id) => segments.some((s) => s.id === id));
  const ownSegments = heroSegments(v.talentId);

  /** Escolher o Hero preenche o segmento dele (se o atual não for um dos segmentos do Hero). */
  function pickHero(talentId: string) {
    const own = heroSegments(talentId);
    setV((cur) => ({ ...cur, talentId, segmentId: segmentForHero(cur.segmentId, own) }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (v.title.trim().length < 3) return setError(t("titleRequired"));
    if (target === "brand" ? !v.brandId : v.brandLabel.trim().length < 2) return setError(t("targetRequired"));
    start(async () => {
      const result = await saveStrategyIdeaAction({ ...v, brandId: target === "brand" ? v.brandId : "", brandLabel: target === "prospect" ? v.brandLabel : "" });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      router.push(`/agencia/estrategias/${result.id ?? v.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate data-testid="strategy-form">
      <FormField label={t("target")}>
        <SegmentedControl<Target>
          aria-label={t("target")}
          value={target}
          onValueChange={setTarget}
          options={[
            { value: "brand", label: t("targets.brand"), disabled: brands.length === 0 },
            { value: "prospect", label: t("targets.prospect") },
          ]}
        />
      </FormField>
      {target === "brand" ? (
        <FormField label={t("brand")} required>
          <EntitySelect
            options={brandOptions}
            value={v.brandId}
            emptyLabel="—"
            roleInOption={false}
            searchAlways
            onChange={(e) => set("brandId", e.target.value)}
            disabled={pending}
            data-testid="strategy-brand"
          />
        </FormField>
      ) : (
        <FormField label={t("brandLabel")} hint={t("brandLabelHint")} required>
          <Input value={v.brandLabel} onChange={(e) => set("brandLabel", e.target.value)} maxLength={120} disabled={pending} data-testid="strategy-brand-label" />
        </FormField>
      )}
      <FormField label={t("hero")}>
        <EntitySelect
          options={heroOptions}
          value={v.talentId}
          emptyLabel="—"
          roleInOption={false}
          searchAlways
          onChange={(e) => pickHero(e.target.value)}
          disabled={pending}
          data-testid="strategy-hero"
        />
      </FormField>
      <FormField
        label={t("segment")}
        hint={ownSegments.length > 0 ? t("segmentFromHero", { names: ownSegments.map((id) => segments.find((s) => s.id === id)?.name ?? "").join(", ") }) : undefined}
      >
        <Select value={v.segmentId} onChange={(e) => set("segmentId", e.target.value)} disabled={pending} data-testid="strategy-segment">
          <option value="">—</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={t("event")} hint={t("eventHint")}>
        <Select
          value={v.calendarEventId}
          onChange={(e) => {
            const ev = events.find((x) => x.id === e.target.value);
            setV((cur) => ({ ...cur, calendarEventId: e.target.value, ideaOn: ev ? ev.day : cur.ideaOn }));
          }}
          disabled={pending}
          data-testid="strategy-event"
        >
          <option value="">—</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {`${ev.day.slice(8, 10)}/${ev.day.slice(5, 7)} · ${ev.title}`}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={t("ideaOn")}>
        <DatePicker value={v.ideaOn} onChange={(d) => set("ideaOn", d)} disabled={pending} />
      </FormField>
      <FormField label={t("title")} required>
        <Input value={v.title} onChange={(e) => set("title", e.target.value)} maxLength={120} disabled={pending} data-testid="strategy-title" />
      </FormField>
      <FormField label={t("body")} hint={t("bodyHint")}>
        <Textarea value={v.body} onChange={(e) => set("body", e.target.value)} rows={7} maxLength={4000} disabled={pending} data-testid="strategy-body" />
      </FormField>
      <p className="flex items-start gap-2 type-caption text-fg-muted" data-testid="strategy-ai">
        <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {aiStatus === "ready" ? t("aiReady") : t("aiOff")}
      </p>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" leadingIcon={<Save />} loading={pending} className="w-full sm:w-fit" data-testid="strategy-save">
        {v.id ? t("save") : t("create")}
      </Button>
    </form>
  );
}
