"use client";

import { useTranslations } from "next-intl";
import { FormField, Select } from "@/components/ui";
import type { ContentFormValues } from "../types";
import { useValidationMessage } from "./fields";
import type { FieldErrors } from "./schema";

type Props = {
  values: Pick<ContentFormValues, "access_level" | "required_module_id" | "completion_mode">;
  onChange: (patch: Partial<Pick<ContentFormValues, "access_level" | "required_module_id" | "completion_mode">>) => void;
  modules: { id: string; name: string; code: string }[];
  errors: FieldErrors;
};

// Grupo só do admin: regra de acesso, módulo exigido (premium) e modo de conclusão.
// A personalidade nunca vê isto; o banco também bloqueia (colunas protegidas).
export function AccessFields({ values, onChange, modules, errors }: Props) {
  const t = useTranslations("editors.access");
  const tv = useValidationMessage();
  const premium = values.access_level === "premium";

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <FormField label={t("level")} hint={t("levelHint")} error={tv(errors.access_level)}>
        <Select value={values.access_level ?? ""} onChange={(e) => onChange({ access_level: (e.target.value || null) as ContentFormValues["access_level"] })}>
          <option value="">{t("levelNone")}</option>
          <option value="free">{t("levelFree")}</option>
          <option value="premium">{t("levelPremium")}</option>
        </Select>
      </FormField>

      <FormField label={t("module")} hint={premium ? t("moduleHintPremium") : t("moduleHint")} error={tv(errors.required_module_id)} required={premium}>
        <Select value={values.required_module_id ?? ""} onChange={(e) => onChange({ required_module_id: e.target.value || null })}>
          <option value="">{t("moduleNone")}</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.code})
            </option>
          ))}
        </Select>
      </FormField>

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
