"use client";

import { useTranslations } from "next-intl";
import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import "@/components/commerce/coming-soon/coming-soon.css";
import { cn } from "@/lib/utils";
import { isActivePath, isPortalPath, NAV_ITEMS, navHref } from "./nav-items";

export { isActivePath, NAV_ITEMS };

type NavProps = {
  /** Coming soon da aba Comprar para quem vê (src/lib/shop/coming-soon.ts): selo "Em breve" e entrada em Colecionáveis. */
  shopSoon?: boolean;
  /** Aba Portal, à esquerda do Perfil (portalNavHref): sem portal, a aba não aparece. */
  portalHref?: string | null;
};

const tabClass = (active: boolean) =>
  cn(
    "relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-[0.6875rem] font-semibold transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
    active ? "text-accent-text" : "text-fg-muted hover:text-fg",
  );

// Barra inferior (mobile): até 6 abas (cabem em 360px: 60px cada, alvo ≥44px) com ícone + rótulo e aria-current.
/** Abas com "Em breve" enquanto o coming soon vale para quem vê (mesma data da loja): Comprar, Social e Explorar. */
const SOON_TABS = new Set(["shop", "home", "explore"]);

export function BottomNav({ shopSoon = false, portalHref = null }: NavProps) {
  const t = useTranslations("nav");
  const ta = useTranslations("common.a11y");
  const pathname = usePathname();

  return (
    <nav
      aria-label={ta("mainNavigation")}
      className="uh-bottomnav uh-chrome fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 backdrop-blur-md safe-bottom md:hidden"
    >
      <ul className="mx-auto grid h-bottomnav max-w-content auto-cols-fr grid-flow-col">
        {NAV_ITEMS.map(({ key, href, icon: Icon, webOnly }) => {
          const active = isActivePath(pathname, href);
          const soon = shopSoon && SOON_TABS.has(key);
          return (
            <Fragment key={key}>
            {key === "profile" && portalHref ? <PortalTab href={portalHref} label={t("tabs.portal")} active={isPortalPath(pathname)} /> : null}
            <li className={cn("contents", webOnly && "native:hidden")}>
              <Link
                href={navHref(key, href, shopSoon)}
                aria-current={active ? "page" : undefined}
                aria-label={soon ? `${t(`tabs.${key}`)} · ${t("soon")}` : undefined}
                className={tabClass(active)}
              >
                {active && <span aria-hidden="true" className="uh-nav-indicator absolute top-0 h-0.5 w-8 rounded-b-full bg-accent" />}
                <span className="relative inline-flex">
                  <Icon className="size-[22px]" aria-hidden="true" strokeWidth={active ? 2.4 : 2} />
                  {soon ? (
                    <span aria-hidden="true" data-testid={`nav-${key}-soon`} className="uh-cs-navbadge absolute -top-1.5 left-1/2 ml-1">
                      {t("soon")}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate">{t(`tabs.${key}`)}</span>
              </Link>
            </li>
            </Fragment>
          );
        })}
      </ul>
    </nav>
  );
}

function PortalTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <li className="contents">
      <Link href={href} data-testid="nav-portal" aria-current={active ? "page" : undefined} className={tabClass(active)}>
        {active && <span aria-hidden="true" className="uh-nav-indicator absolute top-0 h-0.5 w-8 rounded-b-full bg-accent" />}
        <LayoutDashboard className="size-[22px]" aria-hidden="true" strokeWidth={active ? 2.4 : 2} />
        <span className="max-w-full truncate">{label}</span>
      </Link>
    </li>
  );
}

const topLinkClass = (active: boolean) =>
  cn(
    "relative inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    active ? "text-fg after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-accent" : "text-fg-muted hover:bg-surface-hover hover:text-fg",
  );

// Links horizontais da barra superior (desktop).
export function TopNavLinks({ shopSoon = false, portalHref = null }: NavProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <ul className="flex items-center gap-1">
      {NAV_ITEMS.map(({ key, href, webOnly }) => {
        const active = isActivePath(pathname, href);
        const soon = shopSoon && SOON_TABS.has(key);
        return (
          <Fragment key={key}>
          {key === "profile" && portalHref ? (
            <li>
              <Link href={portalHref} className={topLinkClass(isPortalPath(pathname))}>
                {t("tabs.portal")}
              </Link>
            </li>
          ) : null}
          <li className={cn(webOnly && "native:hidden")}>
            <Link href={navHref(key, href, shopSoon)} aria-current={active ? "page" : undefined} className={topLinkClass(active)}>
              {t(`tabs.${key}`)}
              {soon ? <span className="uh-cs-navbadge ml-1.5">{t("soon")}</span> : null}
            </Link>
          </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
