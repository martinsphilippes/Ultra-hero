"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { RIGHTS_STATUSES, createCreator, updateCreator, type CreatorFormValues } from "@/app/admin/ops-actions";
import { Button, Chip, FormField, Input, Select, Switch, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { ILLUSTRATIONS } from "@/lib/avatar/constants";
import { isStoredAvatarUrl, supabaseBaseUrl } from "@/lib/avatar/paths";
import { PILLARS, type Pillar } from "@/lib/supabase/helpers";
import { slugify } from "./slugify";

const AVATARS = ILLUSTRATIONS;
const COVERS = PILLARS.flatMap((p) => [1, 2, 3].map((n) => `/placeholders/cover-${p}-${n}.svg`));

type Props = {
  id?: string;
  initial?: Partial<CreatorFormValues>;
  /** Metadados da documentação privada (só existe na edição). */
  privateMeta?: { reviewedAt: string | null };
};

// Formulário de personalidade (criar/editar). Slug gerado a partir do nome até ser editado à mão.
// Direitos (RF-003/RB-05): status, titular e validade são públicos; documento e notas, só do admin.
export function CreatorForm({ id, initial, privateMeta }: Props) {
  const t = useTranslations("adminOps.creators.form");
  const tp = useTranslations("common.pillars");
  const tc = useTranslations("common.actions");
  const locale = useLocale() as Locale;
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
    rightsStatus: initial?.rightsStatus ?? "fictional",
    rightsHolder: initial?.rightsHolder ?? "",
    rightsValidUntil: initial?.rightsValidUntil ?? "",
    documentRef: initial?.documentRef ?? "",
    privateNotes: initial?.privateNotes ?? "",
  });
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const uploadedPhoto = initial?.avatarUrl && isStoredAvatarUrl(initial.avatarUrl, supabaseBaseUrl()) ? initial.avatarUrl : null;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const authorized = values.rightsStatus === "authorized";

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
      {error && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg">
          {error}
        </p>
      )}
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
            {/* foto enviada pelo herói (0031): o admin mantém ou troca por ilustração */}
            {uploadedPhoto && <option value={uploadedPhoto}>{t("photoKeep")}</option>}
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
      <FormField label={t("rightsNote")} hint={t("rightsNoteHint")}>
        <Textarea value={values.rightsNote ?? ""} maxLength={500} rows={2} disabled={pending} onChange={(e) => set("rightsNote", e.target.value)} />
      </FormField>

      <fieldset className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-elevated p-4">
        <legend className="px-1 text-sm font-semibold text-fg">{t("rightsSection")}</legend>
        <FormField label={t("rightsStatus")} hint={t("rightsStatusHint")}>
          <Select value={values.rightsStatus ?? "fictional"} disabled={pending} onChange={(e) => set("rightsStatus", e.target.value as CreatorFormValues["rightsStatus"])}>
            {RIGHTS_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`rights.${s}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label={t("rightsHolder")} hint={t("rightsHolderHint")} required={authorized}>
            <Input value={values.rightsHolder ?? ""} maxLength={160} disabled={pending} onChange={(e) => set("rightsHolder", e.target.value)} />
          </FormField>
          <FormField label={t("rightsValidUntil")} hint={t("rightsValidUntilHint")}>
            <Input type="date" value={values.rightsValidUntil ?? ""} disabled={pending} onChange={(e) => set("rightsValidUntil", e.target.value)} />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-2xl border border-dashed border-border p-4">
        <legend className="px-1 text-sm font-semibold text-fg">{t("privateSection")}</legend>
        <FormField label={t("documentRef")} hint={t("documentRefHint")}>
          <Input value={values.documentRef ?? ""} maxLength={300} autoComplete="off" disabled={pending} onChange={(e) => set("documentRef", e.target.value)} />
        </FormField>
        <FormField label={t("privateNotes")} hint={t("privateNotesHint")}>
          <Textarea value={values.privateNotes ?? ""} maxLength={2000} rows={3} disabled={pending} onChange={(e) => set("privateNotes", e.target.value)} />
        </FormField>
        {privateMeta?.reviewedAt && <p className="type-caption text-fg-muted">{t("reviewedAt", { date: formatDateTime(privateMeta.reviewedAt, locale) })}</p>}
      </fieldset>

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
