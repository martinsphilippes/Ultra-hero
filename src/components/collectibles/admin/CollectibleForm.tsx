"use client";

import { Lock, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCollectibleAction, type CollectibleFormValues } from "@/app/admin/collectibles/actions";
import { Button, FormField, IconButton, Input, Select, Textarea, useToast } from "@/components/ui";
import {
  centsToInput,
  DEFAULT_INCREMENTS_CENTS,
  durationToMinutes,
  MAX_INCREMENTS,
  minutesToDuration,
  normalizeIncrements,
  parseMoneyToCents,
  type DurationUnit,
} from "@/lib/collectibles/rules";

export type HeroOption = { id: string; name: string };

type Props = {
  id: string | null;
  initial: CollectibleFormValues | null;
  heroes: HeroOption[];
  /** Já começou (ou tem lance): preço, incrementos e duração travados. */
  locked: boolean;
};

// Formulário do colecionável (celular primeiro): textos, herói, fotos (endereços, uma por linha),
// autenticidade, preço inicial, 1 a 4 botões de incremento e duração.
export function CollectibleForm({ id, initial, heroes, locked }: Props) {
  const t = useTranslations("collectibles.admin.form");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const duration = minutesToDuration(initial?.duration_minutes ?? 1440);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [creatorId, setCreatorId] = useState(initial?.creator_id ?? "");
  const [photos, setPhotos] = useState((initial?.photos ?? []).join("\n"));
  const [authenticity, setAuthenticity] = useState(initial?.authenticity_note ?? "");
  const [price, setPrice] = useState(initial ? centsToInput(initial.start_price_cents) : "");
  const [increments, setIncrements] = useState<string[]>((initial?.bid_increments_cents ?? [...DEFAULT_INCREMENTS_CENTS]).map(centsToInput));
  const [durationAmount, setDurationAmount] = useState(String(duration.amount));
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(duration.unit);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    const priceCents = parseMoneyToCents(price);
    if (title.trim().length < 3) next.title = t("errors.title");
    if (priceCents === null || priceCents < 100) next.price = t("errors.price");
    const incs = increments.map(parseMoneyToCents);
    const normalized = incs.some((v) => v === null) ? null : normalizeIncrements(incs as number[]);
    if (!normalized) next.increments = t("errors.increments");
    const minutes = durationToMinutes(Number(durationAmount.replace(",", ".")), durationUnit);
    if (minutes === null) next.duration = t("errors.duration");
    const photoList = photos
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (photoList.length > 8 || photoList.some((p) => !(p.startsWith("/") || p.startsWith("https://")))) next.photos = t("errors.photos");
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const values: CollectibleFormValues = {
      title: title.trim(),
      description: description.trim(),
      creator_id: creatorId || null,
      photos: photoList,
      authenticity_note: authenticity.trim(),
      start_price_cents: priceCents!,
      bid_increments_cents: normalized!,
      duration_minutes: minutes!,
    };
    startTransition(async () => {
      const result = await saveCollectibleAction(id, values);
      if (result.ok) {
        toast({ title: result.message ?? t("updated"), variant: "success" });
        if (!id && result.id) router.push(`/admin/collectibles/${result.id}`);
        else router.refresh();
      } else {
        toast({ title: result.error, variant: "error" });
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormField label={t("title")} required error={errors.title}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </FormField>
      <FormField label={t("hero")} hint={t("heroHint")}>
        <Select value={creatorId} onChange={(e) => setCreatorId(e.target.value)}>
          <option value="">{t("noHero")}</option>
          {heroes.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={t("description")}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={4} />
      </FormField>
      <FormField label={t("photos")} hint={t("photosHint")} error={errors.photos}>
        <Textarea value={photos} onChange={(e) => setPhotos(e.target.value)} rows={3} placeholder="/collectibles/ball.svg" spellCheck={false} />
      </FormField>
      <FormField label={t("authenticity")} hint={t("authenticityHint")}>
        <Textarea value={authenticity} onChange={(e) => setAuthenticity(e.target.value)} maxLength={2000} rows={3} />
      </FormField>

      <fieldset className="flex flex-col gap-4 rounded-xl border border-border p-3" disabled={locked}>
        <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-fg">
          {locked ? <Lock aria-hidden="true" className="size-3.5" /> : null}
          {t("rulesTitle")}
        </legend>
        {locked ? <p className="text-xs text-fg-muted">{t("lockedHint")}</p> : null}
        <FormField label={t("startPrice")} required error={errors.price} hint={t("moneyHint")}>
          <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" leadingIcon={<span className="text-xs font-semibold">R$</span>} />
        </FormField>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-fg" id="increments-label">
            {t("increments")}
          </p>
          <ul className="grid grid-cols-2 gap-2" aria-labelledby="increments-label">
            {increments.map((value, index) => (
              <li key={index} className="flex items-center gap-1">
                <Input
                  aria-label={t("incrementN", { n: index + 1 })}
                  value={value}
                  onChange={(e) => setIncrements((list) => list.map((v, i) => (i === index ? e.target.value : v)))}
                  inputMode="decimal"
                  leadingIcon={<span className="text-xs font-semibold">R$</span>}
                />
                {increments.length > 1 ? (
                  <IconButton label={t("removeIncrement")} icon={<Trash2 />} variant="ghost" onClick={() => setIncrements((list) => list.filter((_, i) => i !== index))} />
                ) : null}
              </li>
            ))}
          </ul>
          {errors.increments ? (
            <p role="alert" className="type-caption font-medium text-danger">
              {errors.increments}
            </p>
          ) : (
            <p className="type-caption text-fg-muted">{t("incrementsHint")}</p>
          )}
          {increments.length < MAX_INCREMENTS ? (
            <Button variant="ghost" size="sm" leadingIcon={<Plus />} className="w-fit" onClick={() => setIncrements((list) => [...list, ""])}>
              {t("addIncrement")}
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <FormField label={t("duration")} required error={errors.duration}>
            <Input value={durationAmount} onChange={(e) => setDurationAmount(e.target.value)} inputMode="numeric" />
          </FormField>
          <Select aria-label={t("durationUnit")} value={durationUnit} onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}>
            <option value="minutes">{t("units.minutes")}</option>
            <option value="hours">{t("units.hours")}</option>
            <option value="days">{t("units.days")}</option>
          </Select>
        </div>
      </fieldset>

      <Button type="submit" size="lg" block loading={pending}>
        {id ? t("save") : t("create")}
      </Button>
    </form>
  );
}
