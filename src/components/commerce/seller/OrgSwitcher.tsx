"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { selectSellerOrg } from "@/app/seller/actions";
import { EntitySelect } from "@/components/ui";

type Props = { orgs: { id: string; name: string }[]; activeId: string };

// Seletor de organização (só aparece quando o usuário pertence a mais de uma).
export function OrgSwitcher({ orgs, activeId }: Props) {
  const t = useTranslations("seller.portal");
  const tp = useTranslations("pickers");
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-fg">
        {t("orgLabel")}
      </label>
      <EntitySelect
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
        aria-describedby={`${id}-hint`}
        roleInOption={false}
        options={orgs.map((o) => ({ value: o.id, name: o.name, role: tp("roles.seller") }))}
      />
      <p id={`${id}-hint`} className="type-caption text-fg-muted">
        {tp("hints.orgSwitcher")}
      </p>
    </div>
  );
}
