import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { getSessionSummary } from "@/lib/auth/session";
import { DEMO_BANNER_COOKIE, isTheme, THEME_COOKIE, type Theme } from "@/lib/theme/constants";
import { BottomNav, TopNavLinks } from "./AppNav";
import { DemoBanner } from "./DemoBanner";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

// Casca do consumidor: banner de demo, barra superior (md+), conteúdo e barra inferior (mobile).
export async function AppShell({ children }: { children: ReactNode }) {
  const [session, cookieStore, t, ta] = await Promise.all([
    getSessionSummary(),
    cookies(),
    getTranslations("nav"),
    getTranslations("common.a11y"),
  ]);
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const theme: Theme = isTheme(themeCookie) ? themeCookie : "system";
  const demoDismissed = cookieStore.get(DEMO_BANNER_COOKIE)?.value === "1";

  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBanner initiallyDismissed={demoDismissed} />

      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md safe-top">
        <div className="mx-auto flex h-topbar max-w-content items-center justify-between gap-4 px-gutter">
          <Link
            href="/"
            aria-label={`Ultra Hero · ${t("tabs.home")}`}
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Logo size="md" />
          </Link>

          {/* Navegação principal só no desktop; no mobile fica na barra inferior */}
          <nav aria-label={ta("mainNavigation")} className="hidden md:block">
            <TopNavLinks />
          </nav>

          <div className="flex items-center gap-0.5">
            <IconButton asChild label={t("actions.search")} icon={<Search />} className="hidden md:inline-flex">
              <Link href="/explore" />
            </IconButton>
            <ThemeToggle initialTheme={theme} />
            <LocaleSwitcher />
            <UserMenu session={session} />
          </div>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-content flex-1 px-gutter pb-[calc(var(--spacing-bottomnav)+env(safe-area-inset-bottom)+1.5rem)] pt-6 outline-none md:pb-12"
      >
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
