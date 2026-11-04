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

type PortalShellProps = {
  portal: Portal;
  children: ReactNode;
  /** Itens do menu permitidos para o papel (calculado no servidor). Sem a prop, todos. */
  navKeys?: readonly string[];
  /** Ação à direita do cabeçalho (o sino de avisos nos portais de gestão). */
  headerAction?: ReactNode;
  /** Selo do portal ("Agência", "Marca"); padrão: nav.portals.<portal>. */
  badge?: string;
};

// Casca dos portais (admin, herói, fornecedor, profissional, agência, marca): sidebar fixa no tablet/desktop, Sheet
// no celular, ação à direita (o sino) e "Voltar ao app" no menu. O Portal do Herói (0097) também tem menu: ele juntou
// a área do herói e o escritório do casting. O gate de papel acontece no layout que chama este componente.
export async function PortalShell({ portal, children, navKeys, headerAction, badge }: PortalShellProps) {
  const [session, cookieStore, t, ta] = await Promise.all([
    getSessionSummary(),
    cookies(),
    getTranslations("nav"),
    getTranslations("common"),
  ]);
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const theme = resolveTheme(themeCookie);

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar (md+) */}
      <aside
        aria-label={ta("a11y.portalNavigation")}
        className="sticky top-0 hidden h-dvh w-sidebar shrink-0 flex-col gap-6 overflow-y-auto border-r border-border bg-surface px-4 py-5 md:flex print:hidden"
      >
        <Link href={PORTAL_ROOT[portal]} className="rounded-lg px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-2 px-2">
          <Badge variant="accent">{badge ?? t(`portals.${portal}`)}</Badge>
        </div>
        <PortalNavList portal={portal} navKeys={navKeys} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="uh-header uh-chrome sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md safe-top print:hidden">
          <div className="flex h-topbar items-center justify-between gap-3 px-gutter">
            <div className="flex min-w-0 items-center gap-2">
              <PortalMobileMenu portal={portal} navKeys={navKeys} />
              <Link href={PORTAL_ROOT[portal]} className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:hidden">
                <Logo size="sm" />
              </Link>
              <p className="hidden truncate text-sm text-fg-muted md:block">{t(`portalDescription.${portal}`)}</p>
            </div>
            <div className="flex items-center gap-0.5">
              {headerAction}
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
