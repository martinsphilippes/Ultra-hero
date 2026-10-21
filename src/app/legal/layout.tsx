import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { resolveTheme, THEME_COOKIE } from "@/lib/theme/constants";

// Casca pública e enxuta dos documentos legais (sem login): marca, tema/idioma, leitura em largura de prosa.
export default async function LegalLayout({ children }: { children: ReactNode }) {
  const [cookieStore, t, tn] = await Promise.all([cookies(), getTranslations("common"), getTranslations("nav.tabs")]);
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const theme = resolveTheme(themeCookie);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-bg/85 backdrop-blur-md safe-top">
        <div className="mx-auto flex h-topbar max-w-content items-center justify-between gap-4 px-gutter">
          <Link
            href="/"
            aria-label={`Ultra Hero · ${tn("home")}`}
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Logo size="md" />
          </Link>
          <div className="flex items-center gap-0.5">
            <ThemeToggle initialTheme={theme} />
            <LocaleSwitcher />
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-prose flex-1 px-gutter py-8 outline-none md:py-12">
        {children}
      </main>

      <footer className="border-t border-border safe-bottom">
        <div className="mx-auto flex w-full max-w-prose flex-col gap-2 px-gutter py-6">
          <LegalLinks />
          <p className="flex flex-wrap items-center gap-2">
            <Badge variant="demo">{t("demo.tag")}</Badge>
            <span className="type-caption text-fg-muted">{t("demo.banner")}</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
