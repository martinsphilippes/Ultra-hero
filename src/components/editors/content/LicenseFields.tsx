"use client";

import { useTranslations } from "next-intl";
import { FormField, Input, Select } from "@/components/ui";
import type { ContentFormValues } from "../types";
import { useValidationMessage } from "./fields";
import { LICENSE_KIND_VALUES, allowedLicenseKinds, type FieldErrors, type LicenseKindValue } from "./schema";

type LicenseValues = Pick<ContentFormValues, "media_license_kind" | "media_license_ref" | "media_credit">;

type Props = {
  provider: string;
  values: LicenseValues;
  onChange: (patch: Partial<LicenseValues>) => void;
  errors: FieldErrors;
};

// Licença e crédito da mídia (RF-008). As opções incoerentes com o provedor ficam desabilitadas;
// o banco recusa a combinação de qualquer forma (media_license_mismatch).
export function LicenseFields({ provider, values, onChange, errors }: Props) {
  const t = useTranslations("editors.license");
  const tv = useValidationMessage();
  const allowed = allowedLicenseKinds(provider) as readonly string[];

  return (
    <div className="flex flex-col gap-4">
      <FormField label={t("kind")} hint={t(`kindHint.${values.media_license_kind}`)} error={tv(errors.media_license_kind)} required>
        <Select value={values.media_license_kind} onChange={(e) => onChange({ media_license_kind: e.target.value as LicenseKindValue })}>
          {LICENSE_KIND_VALUES.map((kind) => (
            <option key={kind} value={kind} disabled={!allowed.includes(kind)}>
              {t(`kinds.${kind}`)}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("credit")} hint={t("creditHint")} error={tv(errors.media_credit)}>
          <Input value={values.media_credit} maxLength={160} onChange={(e) => onChange({ media_credit: e.target.value })} />
        </FormField>
        <FormField label={t("ref")} hint={t("refHint")} error={tv(errors.media_license_ref)}>
          <Input value={values.media_license_ref} maxLength={300} autoComplete="off" spellCheck={false} onChange={(e) => onChange({ media_license_ref: e.target.value })} />
        </FormField>
      </div>
    </div>
  );
}
