"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { selectBrandAction } from "@/app/marca/actions";
import { EntitySelect, FormField } from "@/components/ui";
import { brandOption } from "@/lib/ui/entity";

// Quem atende mais de uma marca (ou o admin geral) escolhe qual está vendo.
export function BrandSwitcher({ brands, currentId }: { brands: Array<{ id: string; name: string; logoUrl?: string | null }>; currentId: string }) {
  const t = useTranslations("brandPortal.dashboard");
  const tp = useTranslations("pickers");
  const [pending, start] = useTransition();
  return (
    <FormField label={t("switchBrand")} hint={tp("hints.brandSwitcher")} className="max-w-sm">
      <EntitySelect
        value={currentId}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          start(async () => {
            const result = await selectBrandAction({ id });
            if (result.ok) window.location.replace("/marca");
          });
        }}
        roleInOption={false}
        options={brands.map((b) => brandOption(tp, b))}
      />
    </FormField>
  );
}
