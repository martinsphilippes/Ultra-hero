"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SegmentedControl } from "@/components/ui";

export const PERIODS = ["7", "14", "30"] as const;
export type Period = (typeof PERIODS)[number];

// Seletor de período (7/14/30 dias) que atualiza ?days= na URL (Server Component relê os dados).
export function PeriodSelector({ value }: { value: Period }) {
  const t = useTranslations("adminOps.common");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function change(next: Period) {
    const sp = new URLSearchParams(params.toString());
    sp.set("days", next);
    startTransition(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
  }

  return (
    <div aria-busy={pending || undefined} className={pending ? "opacity-70 transition-opacity" : undefined}>
      <SegmentedControl
        aria-label={t("periodLabel")}
        size="sm"
        value={value}
        onValueChange={change}
        options={PERIODS.map((p) => ({ value: p, label: t("periodDays", { days: Number(p) }) }))}
      />
    </div>
  );
}

export function parsePeriod(raw: string | undefined): Period {
  return (PERIODS as readonly string[]).includes(raw ?? "") ? (raw as Period) : "14";
}
