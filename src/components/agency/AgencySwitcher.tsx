"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { selectAgencyAction } from "@/app/agencia/actions";
import { FormField, Select } from "@/components/ui";

type Props = { agencies: Array<{ id: string; name: string; isDemo: boolean }>; currentId: string };

// Admin geral escolhe a agência que está vendo (cookie no servidor; recarrega sem histórico).
export function AgencySwitcher({ agencies, currentId }: Props) {
  const t = useTranslations("agency.dashboard");
  const [pending, start] = useTransition();
  return (
    <FormField label={t("switchAgency")} className="max-w-sm">
      <Select
        value={currentId}
        disabled={pending}
        data-testid="agency-switcher"
        onChange={(e) => {
          const id = e.target.value;
          start(async () => {
            const result = await selectAgencyAction({ id });
            if (result.ok) window.location.replace("/agencia");
          });
        }}
      >
        {agencies.map((a) => (
          <option key={a.id} value={a.id}>
            {a.isDemo ? `${a.name} · ${t("demoTag")}` : a.name}
          </option>
        ))}
      </Select>
    </FormField>
  );
}
