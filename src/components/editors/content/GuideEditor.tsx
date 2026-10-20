"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Button, FormField, IconButton, Input, Textarea } from "@/components/ui";
import { ListEditor, useValidationMessage } from "./fields";
import type { FieldErrors, GuideBody } from "./schema";

type Props = { value: GuideBody; onChange: (value: GuideBody) => void; errors: FieldErrors };

// Corpo de guia/artigo: introdução, seções (título + texto) e pontos-chave.
export function GuideEditor({ value, onChange, errors }: Props) {
  const t = useTranslations("editors.body.guide");
  const tv = useValidationMessage();
  const baseId = useId();

  function setSection(index: number, patch: Partial<GuideBody["sections"][number]>) {
    onChange({ ...value, sections: value.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  }

  return (
    <div className="flex flex-col gap-5">
      <FormField label={t("intro")} hint={t("introHint")} error={tv(errors["body.intro"])}>
        <Textarea rows={3} maxLength={2000} value={value.intro} onChange={(e) => onChange({ ...value, intro: e.target.value })} />
      </FormField>

      <div className="flex flex-col gap-3" role="group" aria-labelledby={`${baseId}-sections`}>
        <span id={`${baseId}-sections`} className="text-sm font-semibold text-fg">
          {t("sections")}
        </span>
        <p className="type-caption text-fg-muted">{t("sectionsHint")}</p>
        {tv(errors["body.sections"]) && (
          <p role="alert" className="type-caption font-medium text-danger">
            {tv(errors["body.sections"])}
          </p>
        )}
        {value.sections.map((section, index) => {
          const headingError = tv(errors[`body.sections.${index}.heading`]);
          const textError = tv(errors[`body.sections.${index}.text`]);
          return (
            <section key={index} aria-label={t("sectionN", { n: index + 1 })} className="flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated p-3 sm:p-4">
              <div className="flex items-start gap-2">
                <FormField label={t("heading", { n: index + 1 })} error={headingError} className="flex-1">
                  <Input maxLength={120} value={section.heading} onChange={(e) => setSection(index, { heading: e.target.value })} />
                </FormField>
                <IconButton label={t("removeSection", { n: index + 1 })} icon={<X />} className="mt-6" onClick={() => onChange({ ...value, sections: value.sections.filter((_, i) => i !== index) })} />
              </div>
              <FormField label={t("text", { n: index + 1 })} error={textError} required>
                <Textarea rows={5} maxLength={5000} value={section.text} onChange={(e) => setSection(index, { text: e.target.value })} />
              </FormField>
            </section>
          );
        })}
        <div>
          <Button type="button" variant="secondary" size="sm" leadingIcon={<Plus />} disabled={value.sections.length >= 30} onClick={() => onChange({ ...value, sections: [...value.sections, { heading: "", text: "" }] })}>
            {t("addSection")}
          </Button>
        </div>
      </div>

      <ListEditor
        label={t("keyPoints")}
        hint={t("keyPointsHint")}
        items={value.key_points}
        onChange={(key_points) => onChange({ ...value, key_points })}
        errorPrefix="body.key_points"
        errors={errors}
        max={12}
        itemLabel={(n) => t("keyPoint", { n })}
      />
    </div>
  );
}
