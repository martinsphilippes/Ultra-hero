import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { STARTUP_IMAGES } from "@/lib/pwa/startup-images";
import { AppIntro } from "@/components/layout/AppIntro";
import { AppearanceSync } from "@/components/layout/AppearanceSync";
import { NavHistory } from "@/components/layout/NavHistory";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { SkipLink } from "@/components/ui/skip-link";
import { ToastProvider } from "@/components/ui/toast";
import { getOrigin } from "@/lib/auth/origin";
import { INTRO_INIT_SCRIPT } from "@/lib/intro/script";
import { getNativeApp } from "@/lib/native-app/server";
import { resolveTheme, THEME_COOKIE, THEME_INIT_SCRIPT } from "@/lib/theme/constants";
import { resolveTemplate, TEMPLATE_COOKIE, TEMPLATE_INIT_SCRIPT } from "@/lib/theme/template";
import "./globals.css";
import "./templates.css";
import "./intro.css";

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

// Fontes dos templates de Aparência (todas OFL, ver fonts/OFL.txt). Sem preload: o navegador só baixa
// uma fonte quando algum texto a usa, ou seja, quando o template dela está ativo (ou na prévia do painel).
// display "swap" nunca bloqueia a renderização; a reserva ajustada (adjustFontFallback) evita saltos.
const archivo = localFont({
  src: "./fonts/archivo-wdth-latin.woff2",
  weight: "100 900",
  variable: "--font-archivo",
  display: "swap",
  preload: false,
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});
const fraunces = localFont({ src: "./fonts/fraunces-latin.woff2", weight: "100 900", variable: "--font-fraunces", display: "swap", preload: false });
const figtree = localFont({ src: "./fonts/figtree-latin.woff2", weight: "300 900", variable: "--font-figtree", display: "swap", preload: false });
const inter = localFont({ src: "./fonts/inter-latin.woff2", weight: "100 900", variable: "--font-inter", display: "swap", preload: false });
const unbounded = localFont({ src: "./fonts/unbounded-latin.woff2", weight: "200 900", variable: "--font-unbounded", display: "swap", preload: false });
const spaceGrotesk = localFont({ src: "./fonts/space-grotesk-latin.woff2", weight: "300 700", variable: "--font-space-grotesk", display: "swap", preload: false });
const fontVariables = [manrope, dmMono, archivo, fraunces, figtree, inter, unbounded, spaceGrotesk].map((f) => f.variable).join(" ");

export async function generateMetadata(): Promise<Metadata> {
  const [t, origin] = await Promise.all([getTranslations("common.app"), getOrigin()]);
  return {
    // base dos endereços absolutos (canonical, Open Graph): NEXT_PUBLIC_SITE_URL ou a origem da request
    metadataBase: new URL(origin),
    title: { default: "Groscove Ultra", template: "%s · Groscove Ultra" },
    description: t("description"),
    applicationName: "Groscove Ultra",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "Groscove Ultra", statusBarStyle: "black-translucent", startupImage: STARTUP_IMAGES },
    // Ícones: arquivos em src/app (favicon.ico, icon.svg, apple-icon.png) são detectados pelo Next.
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    // O app abre no escuro independentemente do tema do aparelho.
    { color: "#0B0B0B" },
  ],
};

// Layout raiz: idioma do request, tema do cookie (sem flash) e provedores globais.
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, cookieStore, nativeApp] = await Promise.all([getLocale(), cookies(), getNativeApp()]);
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const theme = resolveTheme(themeCookie);
  // Template visual (Aparência): o servidor já manda o do cookie; o script corrige pelo localStorage.
  const template = resolveTemplate(cookieStore.get(TEMPLATE_COOKIE)?.value);

  return (
    // data-native-app: a casca das lojas (variante `native:` do CSS esconde o que lá não existe)
    <html lang={locale} data-theme={theme} data-template={template} data-native-app={nativeApp?.platform} suppressHydrationWarning className={fontVariables}>
      <head>
        {/* tema, template e (se for a hora) a abertura: tudo decidido antes da primeira pintura */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT + TEMPLATE_INIT_SCRIPT + INTRO_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">
        <AppIntro />
        <NextIntlClientProvider>
          <ToastProvider>
            <SkipLink />
            {children}
          </ToastProvider>
        </NextIntlClientProvider>
        <ServiceWorkerRegister />
        <AppearanceSync />
        <NavHistory />
      </body>
    </html>
  );
}
