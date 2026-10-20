"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { selectSellerOrg } from "@/app/seller/actions";
import { Select } from "@/components/ui";

type Props = { orgs: { id: string; name: string }[]; activeId: string };

// Seletor de organização (só aparece quando o usuário pertence a mais de uma).
export function OrgSwitcher({ orgs, activeId }: Props) {
  const t = useTranslations("seller.portal");
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-fg">
        {t("orgLabel")}
      </label>
      <Select
        id={id}
        value={activeId}
        selectSize="sm"
        disabled={pending}
        aria-label={t("switchOrg")}
        onChange={(e) =>
          startTransition(async () => {
            const result = await selectSellerOrg({ orgId: e.target.value });
            if (result.ok) router.refresh();
          })
        }
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
