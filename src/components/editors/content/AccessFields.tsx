"use client";

import { useTranslations } from "next-intl";
import { FormField, Select } from "@/components/ui";
import type { ContentFormValues } from "../types";
import { useValidationMessage } from "./fields";
import type { FieldErrors } from "./schema";

type Props = {
  values: Pick<ContentFormValues, "completion_mode">;
  onChange: (patch: Partial<Pick<ContentFormValues, "completion_mode">>) => void;
  errors: FieldErrors;
};

// Grupo só do admin: modo de conclusão. O app é gratuito (0069): todo conteúdo é livre para quem
// entrou, então não há regra de acesso nem módulo a escolher. A personalidade nunca vê isto.
export function AccessFields({ values, onChange, errors }: Props) {
  const t = useTranslations("editors.access");
  const tv = useValidationMessage();

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <FormField label={t("completion")} hint={t("completionHint")} error={tv(errors.completion_mode)}>
        <Select value={values.completion_mode ?? ""} onChange={(e) => onChange({ completion_mode: (e.target.value || null) as ContentFormValues["completion_mode"] })}>
          <option value="">{t("completionDefault")}</option>
          <option value="manual">{t("completionManual")}</option>
          <option value="auto">{t("completionAuto")}</option>
        </Select>
      </FormField>
    </div>
  );
}
