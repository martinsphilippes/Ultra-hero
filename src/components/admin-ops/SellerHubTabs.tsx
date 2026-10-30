"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeSellerHubTab, SELLER_HUB_TABS, sellerHubHref } from "@/lib/seller-ops/portal";
import { cn } from "@/lib/utils";

// Abas da organização no admin (o que era o portal do fornecedor + cadastro). Rolagem horizontal no celular.
export function SellerHubTabs({ orgId }: { orgId: string }) {
  const t = useTranslations("adminOps.sellers.hub");
  const pathname = usePathname();
  const active = activeSellerHubTab(pathname ?? "", orgId);
  return (
    <nav aria-label={t("tabsLabel")} className="-mx-gutter overflow-x-auto border-b border-border px-gutter md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1">
        {SELLER_HUB_TABS.map((tab) => {
          const current = tab === active;
          return (
            <li key={tab}>
              <Link
                href={sellerHubHref(orgId, tab)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "relative inline-flex min-h-11 items-center whitespace-nowrap px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                  current ? "text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent" : "text-fg-muted hover:text-fg",
                )}
                data-testid={`seller-hub-tab-${tab}`}
              >
                {t(`tabs.${tab}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
