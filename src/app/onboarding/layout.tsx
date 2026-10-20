import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/layout/Logo";

// Casca mínima do onboarding (sem abas): marca + conteúdo centralizado.
export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("nav.tabs");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-bg/85 backdrop-blur-md safe-top">
        <div className="mx-auto flex h-topbar max-w-content items-center px-gutter">
          <Link href="/" aria-label={t("home")} className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            <Logo size="md" />
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-gutter py-8 outline-none">
        {children}
      </main>
    </div>
  );
}
