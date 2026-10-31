"use client";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Button, FormField, Input, Switch, Textarea, useToast } from "@/components/ui";
import { saveKitAction } from "@/lib/talent/actions";
import { orphanMetricFields } from "@/lib/talent/media-kit";
import { KIT_FIELDS, type KitField } from "@/lib/talent/vocab";

type Props = { portal: "agency" | "office"; talentId: string; headline: string; about: string; visibleFields: string[]; canEdit: boolean };

// Editor do media kit: texto e os campos visíveis (o nome é sempre visível). A prévia ao lado é o que
// a marca vê no link público; nenhum valor (cachê, preço) entra no kit.
export function KitEditor({ portal, talentId, headline: initialHeadline, about: initialAbout, visibleFields, canEdit }: Props) {
  const t = useTranslations("mediaKit.editor");
  const tf = useTranslations("mediaKit.fields");
  const { toast } = useToast();
  const [headline, setHeadline] = useState(initialHeadline);
  const [about, setAbout] = useState(initialAbout);
  const [fields, setFields] = useState<KitField[]>(KIT_FIELDS.filter((f) => visibleFields.includes(f)));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const orphans = orphanMetricFields(fields);

  function toggle(field: KitField, on: boolean) {
    setFields((current) => KIT_FIELDS.filter((f) => (f === field ? on : current.includes(f))));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await saveKitAction(portal, { talentId, headline, about, visibleFields: fields });
      if (!result.ok) setError(result.error);
      else toast({ title: result.message, variant: "success" });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate data-testid="kit-editor">
      <FormField label={t("headline")} hint={t("headlineHint")}>
        <Input value={headline} maxLength={140} onChange={(e) => setHeadline(e.target.value)} disabled={pending || !canEdit} />
      </FormField>
      <FormField label={t("about")} hint={t("aboutHint", { count: about.length })}>
        <Textarea value={about} maxLength={1500} rows={5} onChange={(e) => setAbout(e.target.value)} disabled={pending || !canEdit} />
      </FormField>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-fg">{t("fieldsTitle")}</legend>
        <p className="type-caption text-fg-muted">{t("fieldsHint")}</p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {KIT_FIELDS.map((f) => (
            <li key={f}>
              <Switch size="sm" checked={fields.includes(f)} onCheckedChange={(on) => toggle(f, on)} label={tf(f)} disabled={pending || !canEdit} />
            </li>
          ))}
        </ul>
        {orphans.length > 0 ? <p className="type-caption text-warning">{t("orphanFields")}</p> : null}
      </fieldset>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {canEdit ? (
        <Button type="submit" leadingIcon={<Save />} loading={pending} className="w-fit">
          {t("save")}
        </Button>
      ) : null}
    </form>
  );
}
