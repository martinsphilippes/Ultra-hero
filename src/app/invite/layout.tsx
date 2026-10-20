import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { isTheme, THEME_COOKIE, type Theme } from "@/lib/theme/constants";

// Aceite de convite: cartão centralizado, fora da casca do app (mesmo padrão das telas de auth).
export default async function InviteLayout({ children }: { children: ReactNode }) {
  const [cookieStore, t] = await Promise.all([cookies(), getTranslations("common")]);
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const theme: Theme = isTheme(themeCookie) ? themeCookie : "system";

  return (
    <div className="relative flex min-h-dvh flex-col bg-grid">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-accent/15 to-transparent" />
      <header className="relative flex items-center justify-between px-gutter py-4 safe-top">
        <Link href="/" className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <Logo size="md" />
        </Link>
        <div className="flex items-center gap-0.5">
          <ThemeToggle initialTheme={theme} />
          <LocaleSwitcher />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="relative flex flex-1 flex-col items-center justify-center px-gutter py-8 outline-none">
        <div className="w-full max-w-md animate-slide-up">{children}</div>
        <p className="mt-6 flex items-center gap-2 text-center">
          <Badge variant="demo">{t("demo.tag")}</Badge>
          <span className="type-caption text-fg-muted">{t("demo.banner")}</span>
        </p>
      </main>
    </div>
  );
}
