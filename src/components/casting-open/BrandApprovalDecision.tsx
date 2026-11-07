"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideBrandApprovalAction } from "@/lib/casting-open/brand-actions";
import { Button } from "@/components/ui";

export function BrandApprovalDecision({ brandId }: { brandId: string }) {
  const t = useTranslations("agency.brands.form");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (approve: boolean) =>
    start(async () => {
      const r = await decideBrandApprovalAction({ brandId, approve });
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" size="sm" leadingIcon={<X />} disabled={pending} onClick={() => decide(false)} data-testid="brand-reject">
          {t("reject")}
        </Button>
        <Button type="button" size="sm" leadingIcon={<Check />} loading={pending} onClick={() => decide(true)} data-testid="brand-approve">
          {t("approve")}
        </Button>
      </div>
      {error ? <p className="type-caption text-danger">{error}</p> : null}
    </div>
  );
}
