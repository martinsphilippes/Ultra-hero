import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { SkipLink } from "@/components/ui/skip-link";
import { ToastProvider } from "@/components/ui/toast";
import { getOrigin } from "@/lib/auth/origin";
import { resolveTheme, THEME_COOKIE, THEME_INIT_SCRIPT } from "@/lib/theme/constants";
import "./globals.css";

// Tipografia da marca, servida pelo próprio app (sem chamada ao Google Fonts no cliente):
// Manrope variável para texto e títulos; DM Mono para etiquetas e legendas.
const manrope = localFont({ src: "./fonts/manrope-latin.woff2", weight: "200 800", variable: "--font-manrope", display: "swap" });
const dmMono = localFont({
  src: [
    { path: "./fonts/dm-mono-400-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/dm-mono-500-latin.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-dm-mono",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const [t, origin] = await Promise.all([getTranslations("common.app"), getOrigin()]);
  return {
    // base dos endereços absolutos (canonical, Open Graph): NEXT_PUBLIC_SITE_URL ou a origem da request
    metadataBase: new URL(origin),
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
    // O app abre no claro independentemente do tema do aparelho.
    { color: "#F7F4EF" },
  ],
};

// Layout raiz: idioma do request, tema do cookie (sem flash) e provedores globais.
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, cookieStore] = await Promise.all([getLocale(), cookies()]);
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const theme = resolveTheme(themeCookie);

  return (
    <html lang={locale} data-theme={theme} suppressHydrationWarning className={`${manrope.variable} ${dmMono.variable}`}>
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
