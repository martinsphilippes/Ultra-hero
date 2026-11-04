import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { fetchLiveSummary } from "@/lib/collectibles/queries";
import { getShopComingSoonState } from "@/lib/shop/coming-soon-server";
import { cn } from "@/lib/utils";
import { LiveBadge } from "./LiveBadge";

type Props = { current: "shop" | "collectibles" };

// Topo da aba Comprar: "Loja | Colecionáveis" (links, com aria-current). Colecionáveis ganha o selo
// "AO VIVO" pulsando quando há item ao vivo. Sem a 0057 no banco o seletor some da loja.
// No modo Coming soon (src/lib/shop/coming-soon.ts) Colecionáveis vem primeiro, como aba padrão.
export async function ShopSegment({ current }: Props) {
  const [t, summary, comingSoon] = await Promise.all([getTranslations("collectibles.segment"), fetchLiveSummary(), getShopComingSoonState()]);
  if (!summary.available && current === "shop") return null;

  const shopTab = { key: "shop" as const, href: "/shop", label: t("shop") };
  const collectiblesTab = { key: "collectibles" as const, href: "/shop/colecionaveis", label: t("collectibles") };
  const tabs = comingSoon.locked ? [collectiblesTab, shopTab] : [shopTab, collectiblesTab];

  return (
    <nav aria-label={t("label")} data-testid="shop-segment" className="flex">
      <ul className="grid w-full grid-cols-2 gap-1 rounded-2xl border border-border bg-surface-elevated p-1 sm:w-auto sm:min-w-[22rem]">
        {tabs.map((tab) => {
          const active = tab.key === current;
          return (
            <li key={tab.key} className="min-w-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                  active ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
                )}
              >
                <span className="truncate">{tab.label}</span>
                {tab.key === "collectibles" && summary.liveCount > 0 ? <LiveBadge label={t("live")} /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
