"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SegmentedControl } from "@/components/ui";
import { PERIODS } from "./period";

// Seletor de período (7/14/30 dias; os Indicadores usam 7/30/90) que atualiza ?days= na URL
// (Server Component relê os dados; os outros parâmetros da URL ficam).
export function PeriodSelector<P extends string>({ value, periods = PERIODS as unknown as readonly P[] }: { value: P; periods?: readonly P[] }) {
  const t = useTranslations("adminOps.common");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function change(next: P) {
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
        options={periods.map((p) => ({ value: p, label: t("periodDays", { days: Number(p) }) }))}
      />
    </div>
  );
}
