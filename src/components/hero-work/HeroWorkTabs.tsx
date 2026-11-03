import { CalendarDays, Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

type Props = { current: "agenda" | "finance"; showFinance: boolean };

const BASE =
  "flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Troca simples entre Agenda e Financeiro (o portal do herói não tem menu lateral): dois botões grandes.
export async function HeroWorkTabs({ current, showFinance }: Props) {
  const t = await getTranslations("heroWork.shortcuts");
  const on = "border-accent bg-accent-soft text-accent-text";
  const off = "border-border bg-surface text-fg hover:bg-surface-hover";
  return (
    <nav aria-label={t("tabsLabel")} className="flex gap-2" data-testid="hero-work-tabs">
      <Link href="/creator/agenda" aria-current={current === "agenda" ? "page" : undefined} className={`${BASE} ${current === "agenda" ? on : off}`}>
        <CalendarDays className="size-5" aria-hidden="true" />
        {t("agenda")}
      </Link>
      {showFinance ? (
        <Link href="/creator/financeiro" aria-current={current === "finance" ? "page" : undefined} className={`${BASE} ${current === "finance" ? on : off}`}>
          <Wallet className="size-5" aria-hidden="true" />
          {t("finance")}
        </Link>
      ) : null}
    </nav>
  );
}
