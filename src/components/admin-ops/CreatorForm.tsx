"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { createCreator, updateCreator, type CreatorFormValues } from "@/app/admin/ops-actions";
import { Button, Chip, FormField, Input, Select, Switch, Textarea, useToast } from "@/components/ui";
import { PILLARS, type Pillar } from "@/lib/supabase/helpers";
import { slugify } from "./slugify";

const AVATARS = Array.from({ length: 8 }, (_, i) => `/placeholders/avatar-${i + 1}.svg`);
const COVERS = PILLARS.flatMap((p) => [1, 2, 3].map((n) => `/placeholders/cover-${p}-${n}.svg`));

type Props = { id?: string; initial?: Partial<CreatorFormValues> };

// Formulário de personalidade (criar/editar). Slug gerado a partir do nome até ser editado à mão.
export function CreatorForm({ id, initial }: Props) {
  const t = useTranslations("adminOps.creators.form");
  const tp = useTranslations("common.pillars");
  const tc = useTranslations("common.actions");
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<CreatorFormValues>({
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    headline: initial?.headline ?? "",
    bio: initial?.bio ?? "",
    pillars: initial?.pillars ?? [],
    avatarUrl: initial?.avatarUrl ?? AVATARS[0],
    coverUrl: initial?.coverUrl ?? COVERS[0],
    isFictional: initial?.isFictional ?? true,
    rightsNote: initial?.rightsNote ?? "",
    sortOrder: initial?.sortOrder ?? 100,
  });
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof CreatorFormValues>(key: K, value: CreatorFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function togglePillar(p: Pillar) {
    const current = values.pillars as Pillar[];
    set("pillars", current.includes(p) ? current.filter((x) => x !== p) : [...current, p]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = id ? await updateCreator(id, values) : await createCreator(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: result.message ?? t("updated"), variant: "success" });
      if (!id && "id" in result) router.push(`/admin/creators/${result.id}`);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label={t("name")} required>
          <Input
            value={values.name}
            maxLength={80}
            disabled={pending}
            onChange={(e) => {
              set("name", e.target.value);
              if (!slugTouched) set("slug", slugify(e.target.value));
            }}
          />
        </FormField>
        <FormField label={t("slug")} hint={t("slugHint")} required>
          <Input
            value={values.slug}
            maxLength={80}
            disabled={pending}
            className="font-mono"
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", slugify(e.target.value));
            }}
          />
        </FormField>
      </div>
      <FormField label={t("headline")}>
        <Input value={values.headline ?? ""} maxLength={140} disabled={pending} onChange={(e) => set("headline", e.target.value)} />
      </FormField>
      <FormField label={t("bio")}>
        <Textarea value={values.bio ?? ""} maxLength={2000} rows={5} disabled={pending} onChange={(e) => set("bio", e.target.value)} />
      </FormField>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-fg">{t("pillars")}</legend>
        <div className="flex flex-wrap gap-2">
          {PILLARS.map((p) => (
            <Chip key={p} variant={p} selected={(values.pillars as Pillar[]).includes(p)} onClick={() => togglePillar(p)} disabled={pending}>
              {tp(p)}
            </Chip>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 md:grid-cols-3">
        <FormField label={t("avatar")}>
          <Select value={values.avatarUrl} disabled={pending} onChange={(e) => set("avatarUrl", e.target.value)}>
            {AVATARS.map((src, i) => (
              <option key={src} value={src}>
                {t("placeholderOption", { n: i + 1 })}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("cover")}>
          <Select value={values.coverUrl} disabled={pending} onChange={(e) => set("coverUrl", e.target.value)}>
            {COVERS.map((src) => (
              <option key={src} value={src}>
                {src.replace("/placeholders/cover-", "").replace(".svg", "")}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("sortOrder")}>
          <Input type="number" min={0} max={10000} inputMode="numeric" value={String(values.sortOrder)} disabled={pending} onChange={(e) => set("sortOrder", Number(e.target.value))} />
        </FormField>
      </div>
      <div className="flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-surface-elevated p-3">
        {/* Prévia dos placeholders escolhidos (decorativa) */}
        <span className="relative size-14 shrink-0 overflow-hidden rounded-full border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={values.avatarUrl} alt="" className="size-full object-cover" />
        </span>
        <span className="relative h-14 flex-1 overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={values.coverUrl} alt="" className="size-full object-cover" />
        </span>
      </div>
      <Switch id="creator-fictional" checked={values.isFictional} onCheckedChange={(c) => set("isFictional", c)} label={t("isFictional")} description={t("isFictionalHint")} disabled={pending} />
      <FormField label={t("rightsNote")} hint={t("rightsNoteHint")} error={error ?? undefined}>
        <Textarea value={values.rightsNote ?? ""} maxLength={500} rows={2} disabled={pending} onChange={(e) => set("rightsNote", e.target.value)} />
      </FormField>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          {tc("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
