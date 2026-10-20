import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { SkipLink } from "@/components/ui/skip-link";
import { ToastProvider } from "@/components/ui/toast";
import { isTheme, THEME_COOKIE, THEME_INIT_SCRIPT } from "@/lib/theme/constants";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.app");
  return {
    title: { default: "Ultra Hero", template: "%s · Ultra Hero" },
    description: t("description"),
    applicationName: "Ultra Hero",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "Ultra Hero", statusBarStyle: "black-translucent" },
    // Ícones: arquivos em src/app (favicon.ico, icon.svg, apple-icon.png) são detectados pelo Next.
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0B" },
    { media: "(prefers-color-scheme: light)", color: "#F7F4EF" },
  ],
};

// Layout raiz: idioma do request, tema do cookie (sem flash) e provedores globais.
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, cookieStore] = await Promise.all([getLocale(), cookies()]);
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const theme = isTheme(themeCookie) && themeCookie !== "system" ? themeCookie : undefined;

  return (
    <html lang={locale} data-theme={theme} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">
        <NextIntlClientProvider>
          <ToastProvider>
            <SkipLink />
            {children}
          </ToastProvider>
        </NextIntlClientProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
