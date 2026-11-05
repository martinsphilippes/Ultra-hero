import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { PushRegistrar } from "@/components/push/PushRegistrar";
import { IconButton } from "@/components/ui/icon-button";
import { getSessionSummary } from "@/lib/auth/session";
import { getNativeApp } from "@/lib/native-app/server";
import { getMyPortalItems } from "@/lib/portals/server";
import { isShopComingSoon, shopLockedFor } from "@/lib/shop/coming-soon";
import { resolveTheme, THEME_COOKIE } from "@/lib/theme/constants";
import { BottomNav, TopNavLinks } from "./AppNav";
import { portalNavHref } from "./nav-items";
import { AppearanceMenu } from "./AppearanceMenu";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

// Casca do consumidor: barra superior (md+), conteúdo e barra inferior (mobile).
export async function AppShell({ children }: { children: ReactNode }) {
  const [session, cookieStore, t, ta, nativeApp, portals] = await Promise.all([
    getSessionSummary(),
    cookies(),
    getTranslations("nav"),
    getTranslations("common.a11y"),
    getNativeApp(),
    getMyPortalItems(),
  ]);
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const theme = resolveTheme(themeCookie);
  // Coming soon da aba Comprar: selo "Em breve" e Colecionáveis como entrada (admin vê a loja normal)
  const shopSoon = shopLockedFor({ comingSoon: isShopComingSoon(), isAdmin: session?.roles.includes("admin") ?? false });
  const portalHref = portalNavHref(portals.map((portal) => portal.href));

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Impressão (receitas): só o conteúdo da página; a casca do app fica de fora */}

      {/* Espaço do cabeçalho fixo: o cabeçalho fica preso ao topo da tela e o conteúdo rola por baixo */}
      <div aria-hidden="true" className="h-[calc(var(--spacing-topbar)+1px+env(safe-area-inset-top,0px))] shrink-0 print:hidden" />
      <header className="uh-header uh-chrome fixed inset-x-0 top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md safe-top print:hidden">
        <div className="mx-auto flex h-topbar max-w-content items-center justify-between gap-4 px-gutter">
          <Link
            href="/"
            aria-label={`Groscove Ultra · ${t("tabs.home")}`}
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Logo size="md" />
          </Link>

          {/* Navegação principal só no desktop; no mobile fica na barra inferior */}
          <nav aria-label={ta("mainNavigation")} className="hidden md:block">
            <TopNavLinks shopSoon={shopSoon} portalHref={portalHref} />
          </nav>

          <div className="flex items-center gap-0.5">
            <IconButton asChild label={t("actions.search")} icon={<Search />} className="hidden md:inline-flex">
              <Link href="/explore" />
            </IconButton>
            <AppearanceMenu />
            <ThemeToggle initialTheme={theme} />
            <LocaleSwitcher />
            <UserMenu session={session} />
          </div>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="uh-native-scroller mx-auto w-full max-w-content flex-1 px-gutter pb-[calc(var(--spacing-bottomnav)+env(safe-area-inset-bottom)+1.5rem)] pt-6 outline-none md:pb-12 print:max-w-none print:p-0"
      >
        {children}
      </main>

      <div className="print:hidden">
        <BottomNav shopSoon={shopSoon} portalHref={portalHref} />
      </div>
      {/* app das lojas, logado: mantém o token de push deste aparelho na conta */}
      {session && nativeApp ? <PushRegistrar /> : null}
    </div>
  );
}
