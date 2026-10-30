import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { getSessionSummary } from "@/lib/auth/session";
import { resolveTheme, THEME_COOKIE } from "@/lib/theme/constants";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { Logo } from "./Logo";
import { PortalMobileMenu, PortalNavList } from "./PortalSidebar";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { PORTAL_ROOT, type Portal } from "./portal-nav";

type PortalShellProps = { portal: Portal; children: ReactNode };

// Casca dos portais (admin/personalidade/fornecedor): sidebar fixa no desktop, Sheet no mobile.
// Portal do herói: sem menu (nem lateral nem de três linhas). Os atalhos moram no Perfil do app;
// aqui fica só "← Perfil" para voltar.
// O gate de papel acontece no layout que chama este componente (server-side).
export async function PortalShell({ portal, children }: PortalShellProps) {
  const [session, cookieStore, t, ta] = await Promise.all([
    getSessionSummary(),
    cookies(),
    getTranslations("nav"),
    getTranslations("common"),
  ]);
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const theme = resolveTheme(themeCookie);
  const withMenu = portal !== "creator";

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar (md+) */}
      {withMenu && (
      <aside
        aria-label={ta("a11y.portalNavigation")}
        className="sticky top-0 hidden h-dvh w-sidebar shrink-0 flex-col gap-6 overflow-y-auto border-r border-border bg-surface px-4 py-5 md:flex"
      >
        <Link href={PORTAL_ROOT[portal]} className="rounded-lg px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-2 px-2">
          <Badge variant="accent">{t(`portals.${portal}`)}</Badge>
          <Badge variant="demo">{ta("demo.tag")}</Badge>
        </div>
        <PortalNavList portal={portal} />
      </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="uh-header uh-chrome sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md safe-top">
          <div className="flex h-topbar items-center justify-between gap-3 px-gutter">
            <div className="flex min-w-0 items-center gap-2">
              {withMenu ? (
                <>
                  <PortalMobileMenu portal={portal} />
                  <Link href={PORTAL_ROOT[portal]} className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:hidden">
                    <Logo size="sm" />
                  </Link>
                  <p className="hidden truncate text-sm text-fg-muted md:block">{t(`portalDescription.${portal}`)}</p>
                </>
              ) : (
                <Link
                  href="/profile"
                  data-testid="portal-back-profile"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-2 text-sm font-semibold text-fg hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <ArrowLeft className="size-5" aria-hidden="true" />
                  {t("backToProfile")}
                </Link>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <ThemeToggle initialTheme={theme} />
              <LocaleSwitcher />
              <UserMenu session={session} />
            </div>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-content flex-1 px-gutter py-6 outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
