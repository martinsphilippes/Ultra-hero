"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "@/components/commerce/coming-soon/coming-soon.css";
import { cn } from "@/lib/utils";
import { isActivePath, NAV_ITEMS, navHref } from "./nav-items";

export { isActivePath, NAV_ITEMS };

type NavProps = {
  /** Coming soon da aba Comprar para quem vê (src/lib/shop/coming-soon.ts): selo "Em breve" e entrada em Colecionáveis. */
  shopSoon?: boolean;
};

// Barra inferior (mobile): 5 abas (cabem em 360px: ~72px cada, alvo ≥44px) com ícone + rótulo e aria-current.
export function BottomNav({ shopSoon = false }: NavProps) {
  const t = useTranslations("nav");
  const ta = useTranslations("common.a11y");
  const pathname = usePathname();

  return (
    <nav
      aria-label={ta("mainNavigation")}
      className="uh-bottomnav uh-chrome fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 backdrop-blur-md safe-bottom md:hidden"
    >
      <ul className="mx-auto grid h-bottomnav max-w-content grid-cols-5 native:grid-cols-4">
        {NAV_ITEMS.map(({ key, href, icon: Icon, webOnly }) => {
          const active = isActivePath(pathname, href);
          const soon = shopSoon && key === "shop";
          return (
            <li key={key} className={cn("contents", webOnly && "native:hidden")}>
              <Link
                href={navHref(key, href, shopSoon)}
                aria-current={active ? "page" : undefined}
                aria-label={soon ? `${t(`tabs.${key}`)} · ${t("soon")}` : undefined}
                className={cn(
                  "relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-[0.6875rem] font-semibold transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                  active ? "text-accent-text" : "text-fg-muted hover:text-fg",
                )}
              >
                {active && <span aria-hidden="true" className="uh-nav-indicator absolute top-0 h-0.5 w-8 rounded-b-full bg-accent" />}
                <span className="relative inline-flex">
                  <Icon className="size-[22px]" aria-hidden="true" strokeWidth={active ? 2.4 : 2} />
                  {soon ? (
                    <span aria-hidden="true" data-testid="nav-shop-soon" className="uh-cs-navbadge absolute -top-1.5 left-1/2 ml-1">
                      {t("soon")}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate">{t(`tabs.${key}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Links horizontais da barra superior (desktop).
export function TopNavLinks({ shopSoon = false }: NavProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <ul className="flex items-center gap-1">
      {NAV_ITEMS.map(({ key, href, webOnly }) => {
        const active = isActivePath(pathname, href);
        const soon = shopSoon && key === "shop";
        return (
          <li key={key} className={cn(webOnly && "native:hidden")}>
            <Link
              href={navHref(key, href, shopSoon)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                active ? "text-fg after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-accent" : "text-fg-muted hover:bg-surface-hover hover:text-fg",
              )}
            >
              {t(`tabs.${key}`)}
              {soon ? <span className="uh-cs-navbadge ml-1.5">{t("soon")}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
