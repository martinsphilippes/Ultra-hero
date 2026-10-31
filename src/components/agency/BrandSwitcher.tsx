"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { selectBrandAction } from "@/app/marca/actions";
import { FormField, Select } from "@/components/ui";

// Quem atende mais de uma marca (ou o admin geral) escolhe qual está vendo.
export function BrandSwitcher({ brands, currentId }: { brands: Array<{ id: string; name: string }>; currentId: string }) {
  const t = useTranslations("brandPortal.dashboard");
  const [pending, start] = useTransition();
  return (
    <FormField label={t("switchBrand")} className="max-w-sm">
      <Select
        value={currentId}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          start(async () => {
            const result = await selectBrandAction({ id });
            if (result.ok) window.location.replace("/marca");
          });
        }}
      >
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
    </FormField>
  );
}
