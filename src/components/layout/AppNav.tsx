"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActivePath, NAV_ITEMS } from "./nav-items";

export { isActivePath, NAV_ITEMS };

// Barra inferior (mobile): 4 abas com ícone + rótulo e aria-current.
export function BottomNav() {
  const t = useTranslations("nav");
  const ta = useTranslations("common.a11y");
  const pathname = usePathname();

  return (
    <nav
      aria-label={ta("mainNavigation")}
      className="uh-bottomnav uh-chrome fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 backdrop-blur-md safe-bottom md:hidden"
    >
      <ul className="mx-auto grid h-bottomnav max-w-content grid-cols-4">
        {NAV_ITEMS.map(({ key, href, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <li key={key} className="contents">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-11 flex-col items-center justify-center gap-1 text-[0.6875rem] font-semibold transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                  active ? "text-accent-text" : "text-fg-muted hover:text-fg",
                )}
              >
                {active && <span aria-hidden="true" className="uh-nav-indicator absolute top-0 h-0.5 w-8 rounded-b-full bg-accent" />}
                <Icon className="size-[22px]" aria-hidden="true" strokeWidth={active ? 2.4 : 2} />
                <span className="truncate">{t(`tabs.${key}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Links horizontais da barra superior (desktop).
export function TopNavLinks() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <ul className="flex items-center gap-1">
      {NAV_ITEMS.map(({ key, href }) => {
        const active = isActivePath(pathname, href);
        return (
          <li key={key}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                active ? "text-fg after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-accent" : "text-fg-muted hover:bg-surface-hover hover:text-fg",
              )}
            >
              {t(`tabs.${key}`)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
