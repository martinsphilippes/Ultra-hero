import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Briefcase,
  CalendarDays,
  ChefHat,
  ChevronDown,
  ClipboardList,
  FileText,
  Handshake,
  LayoutDashboard,
  Megaphone,
  Search,
  Smartphone,
  Sparkles,
  Sun,
  Trophy,
  User,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { legalRichTags } from "@/components/legal/rich-tags";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { Logo, LogoMark } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SeasonalTheme } from "@/components/seasonal-theme/SeasonalTheme";
import { Button } from "@/components/ui";
import { LOGIN_HOME } from "@/lib/auth/safe-next";
import { getUser } from "@/lib/auth/session";
import { CALENDAR_POINTS, FAQ_ITEMS, FEATURE_GROUPS, HOW_STEPS, SECTION_ANCHORS, WHAT_ITEMS } from "@/lib/institutional/content";
import { INSTITUTIONAL_EXPLORE_PATH, INSTITUTIONAL_LOGIN_HREF, INSTITUTIONAL_PATH, INSTITUTIONAL_SIGNUP_HREF } from "@/lib/institutional/root";
import { resolveTheme, THEME_COOKIE } from "@/lib/theme/constants";

// Página institucional (etapa 7 · M6/D10): a "apresentação antes de abrir a conta". Visitante sem sessão chega aqui
// pelo "/" (middleware); logado e app das lojas seguem direto ao app. Componente de servidor, sem imagens: só a marca
// em SVG, ícones e os componentes do app (os templates de Aparência e os temas sazonais valem aqui também).
// Só funcionalidades que existem (src/lib/institutional/content.ts); pagamentos e compras: "ainda não ativados".

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("institutional.meta");
  return {
    title: { absolute: t("title") },
    description: t("description"),
    alternates: { canonical: INSTITUTIONAL_PATH },
    openGraph: { type: "website", siteName: "Groscove Ultra", title: t("title"), description: t("description"), url: INSTITUTIONAL_PATH },
    twitter: { card: "summary", title: t("title"), description: t("description") },
  };
}

const WHAT_ICONS: Record<(typeof WHAT_ITEMS)[number], LucideIcon> = { brand: Megaphone, hero: Trophy, agency: Briefcase, app: Smartphone };

const FEATURE_ICONS: Record<string, LucideIcon> = {
  "heroes.page": User,
  "heroes.content": Sparkles,
  "heroes.portal": LayoutDashboard,
  "heroes.opportunities": Handshake,
  "heroes.agenda": CalendarDays,
  "heroes.finance": Wallet,
  "brands.catalog": Search,
  "brands.campaigns": ClipboardList,
  "brands.calls": Megaphone,
  "brands.sponsorship": Trophy,
  "brands.budget": Wallet,
  "brands.reports": FileText,
  "agency.casting": UsersRound,
  "agency.deals": Handshake,
  "agency.castBuilder": Users,
  "agency.agenda": CalendarDays,
  "app.content": BookOpen,
  "app.programs": BadgeCheck,
  "app.recipes": ChefHat,
  "app.today": Sun,
};

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export default async function InstitutionalPage() {
  const [t, cookieStore, user] = await Promise.all([getTranslations("institutional"), cookies(), getUser()]);
  const theme = resolveTheme(cookieStore.get(THEME_COOKIE)?.value);
  const signedIn = user !== null;
  const year = new Date().getFullYear();

  // Logado que abriu /conheca direto: um só botão para o app (não muda nada da autenticação).
  const ctas = signedIn ? (
    <Button asChild size="lg" trailingIcon={<ArrowRight className="size-4" aria-hidden="true" />}>
      <Link href={LOGIN_HOME}>{t("nav.openApp")}</Link>
    </Button>
  ) : (
    <>
      <Button asChild size="lg">
        <Link href={INSTITUTIONAL_SIGNUP_HREF} data-testid="institutional-signup">
          {t("nav.signup")}
        </Link>
      </Button>
      <Button asChild size="lg" variant="secondary">
        <Link href={INSTITUTIONAL_LOGIN_HREF} data-testid="institutional-login">
          {t("nav.login")}
        </Link>
      </Button>
    </>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md safe-top">
        <div className="mx-auto flex h-topbar max-w-content items-center justify-between gap-3 px-gutter">
          <Link href={INSTITUTIONAL_PATH} aria-label={t("nav.home")} className={`rounded-lg ${focusRing}`}>
            <Logo size="md" />
          </Link>
          <div className="flex items-center gap-0.5">
            <ThemeToggle initialTheme={theme} />
            <LocaleSwitcher />
            {signedIn ? null : (
              <Button asChild size="sm" variant="ghost" className="ml-1 hidden sm:inline-flex">
                <Link href={INSTITUTIONAL_LOGIN_HREF}>{t("nav.login")}</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="relative flex-1 outline-none">
        <div className="mx-auto max-w-content px-gutter pt-4 empty:hidden">
          <SeasonalTheme area="institutional" />
        </div>

        {/* Abertura: proposta de valor e CTAs */}
        <section aria-labelledby="inst-hero" className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-accent/15 to-transparent" />
          <div className="relative mx-auto flex max-w-content flex-col gap-6 px-gutter pb-10 pt-8 md:flex-row md:items-center md:gap-12 md:pb-16 md:pt-16">
            <div className="flex flex-1 flex-col gap-5">
              <p className="type-overline text-accent-text">{t("hero.eyebrow")}</p>
              <h1 id="inst-hero" className="type-display max-w-[20ch] text-balance text-fg">
                {t("hero.title")}
              </h1>
              <p className="type-body max-w-prose text-fg-muted md:text-lg">{t("hero.lead")}</p>
              {signedIn ? <p className="type-body-sm text-fg-muted">{t("hero.signedIn")}</p> : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">{ctas}</div>
              {signedIn ? null : (
                // <a> comum (sem prefetch): o handler grava a escolha só quando a pessoa clica
                <a
                  href={INSTITUTIONAL_EXPLORE_PATH}
                  data-testid="institutional-skip"
                  className={`inline-flex min-h-11 w-fit items-center gap-1 rounded-md text-sm font-semibold text-accent-text underline-offset-4 hover:underline ${focusRing}`}
                >
                  {t("nav.skip")}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              )}
            </div>
            {/* Os quatro acessos, como um "cartão" da marca (decorativo: o texto está na seção seguinte) */}
            <div aria-hidden="true" className="hidden flex-1 md:block">
              <div className="clip-step relative mx-auto aspect-[4/3] max-w-md overflow-hidden rounded-2xl border border-border bg-surface p-8 shadow-md">
                <LogoMark className="absolute -right-6 -top-6 h-40 opacity-10" />
                <div className="grid h-full grid-cols-2 gap-3">
                  {WHAT_ITEMS.map((key) => {
                    const Icon = WHAT_ICONS[key];
                    return (
                      <div key={key} className="flex flex-col justify-between rounded-xl border border-border bg-bg p-4">
                        <Icon className="size-6 text-accent-text" />
                        <span className="type-h3 text-fg">{t(`what.items.${key}.title`)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Navegação interna (rolável no celular) */}
        <nav aria-label={t("nav.sections")} className="border-y border-border bg-surface/60">
          <ul className="mx-auto flex max-w-content gap-2 overflow-x-auto px-gutter py-2 [scrollbar-width:none]">
            {SECTION_ANCHORS.map((a) => (
              <li key={a.id} className="shrink-0">
                <a href={`#${a.id}`} className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-fg-muted hover:bg-surface-hover hover:text-fg ${focusRing}`}>
                  {t(a.labelKey)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mx-auto flex max-w-content flex-col gap-16 px-gutter py-12 md:gap-24 md:py-20">
          {/* O que é */}
          <section aria-labelledby="o-que-e-title" id="o-que-e" className="flex flex-col gap-6">
            <SectionHead id="o-que-e" title={t("what.title")} lead={t("what.lead")} />
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {WHAT_ITEMS.map((key) => {
                const Icon = WHAT_ICONS[key];
                return (
                  <li key={key} className="uh-card flex flex-col gap-2 rounded-xl border border-border bg-surface p-5 shadow-sm">
                    <Icon className="size-6 text-accent-text" aria-hidden="true" />
                    <h3 className="type-h3 text-fg">{t(`what.items.${key}.title`)}</h3>
                    <p className="type-body-sm text-fg-muted">{t(`what.items.${key}.body`)}</p>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Como funciona */}
          <section aria-labelledby="como-funciona-title" id="como-funciona" className="flex scroll-mt-20 flex-col gap-6">
            <SectionHead id="como-funciona" title={t("how.title")} lead={t("how.lead")} />
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {HOW_STEPS.map((key, i) => (
                <li key={key} className="flex gap-4 rounded-xl border border-border bg-surface p-5">
                  <span aria-hidden="true" className="type-numeric flex size-10 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-sm font-semibold text-accent-fg">
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="type-h3 text-fg">{t(`how.steps.${key}.title`)}</h3>
                    <p className="type-body-sm text-fg-muted">{t(`how.steps.${key}.body`)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="type-body-sm rounded-xl border border-accent/30 bg-accent/10 p-4 text-fg">{t("how.note")}</p>
          </section>

          {/* Heróis, Marcas, Agência, App */}
          {FEATURE_GROUPS.map((group) => (
            <section key={group.id} aria-labelledby={`${group.id}-title`} id={group.id} className="flex scroll-mt-20 flex-col gap-6">
              <SectionHead id={group.id} title={t(`${group.ns}.title`)} lead={t(`${group.ns}.lead`)} />
              {/* 4 recursos: 4 colunas no desktop (sem cartão sozinho na última linha); 6: 3 colunas */}
              <ul className={`grid gap-3 sm:grid-cols-2 ${group.items.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
                {group.items.map((item) => {
                  const Icon = FEATURE_ICONS[`${group.ns}.${item.key}`] ?? Sparkles;
                  return (
                    <li key={item.key} className="flex gap-4 rounded-xl border border-border bg-surface p-5">
                      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent-text">
                        <Icon className="size-5" />
                      </span>
                      <div className="flex flex-col gap-1">
                        <h3 className="type-h3 text-fg">{t(`${group.ns}.items.${item.key}.title`)}</h3>
                        <p className="type-body-sm text-fg-muted">{t(`${group.ns}.items.${item.key}.body`)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {group.ns === "app" ? (
                <a href={INSTITUTIONAL_EXPLORE_PATH} className={`inline-flex min-h-11 w-fit items-center gap-1 rounded-md text-sm font-semibold text-accent-text underline-offset-4 hover:underline ${focusRing}`}>
                  {t("app.cta")}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              ) : null}
            </section>
          ))}

          {/* Calendário Groscove */}
          <section aria-labelledby="calendario-title" id="calendario" className="scroll-mt-20">
            <div className="clip-step flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 md:flex-row md:items-start md:gap-10 md:p-10">
              <div className="flex flex-col gap-2 md:w-2/5">
                <CalendarDays className="size-8 text-accent-text" aria-hidden="true" />
                <h2 id="calendario-title" className="type-h1 text-fg">
                  {t("calendar.title")}
                </h2>
                <p className="type-body text-fg-muted">{t("calendar.lead")}</p>
              </div>
              <ul className="flex flex-1 flex-col gap-3">
                {CALENDAR_POINTS.map((key) => (
                  <li key={key} className="flex gap-3">
                    <BadgeCheck className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
                    <span className="type-body text-fg">{t(`calendar.points.${key}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Perguntas frequentes (details nativo: sem JS) */}
          <section aria-labelledby="perguntas-title" id="perguntas" className="flex scroll-mt-20 flex-col gap-6">
            <SectionHead id="perguntas" title={t("faq.title")} />
            <div className="flex flex-col gap-2">
              {FAQ_ITEMS.map((key) => (
                <details key={key} className="group rounded-xl border border-border bg-surface">
                  <summary className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 font-semibold text-fg [&::-webkit-details-marker]:hidden ${focusRing}`}>
                    {t(`faq.items.${key}.q`)}
                    <ChevronDown className="size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="type-body-sm px-4 pb-4 text-fg-muted">{t.rich(`faq.items.${key}.a`, { privacy: legalRichTags.privacy })}</p>
                </details>
              ))}
            </div>
          </section>

          {/* Chamada final */}
          <section aria-labelledby="comecar-title" className="flex flex-col items-start gap-4 rounded-2xl bg-accent/10 p-6 md:items-center md:p-12 md:text-center">
            <h2 id="comecar-title" className="type-h1 text-fg">
              {t("final.title")}
            </h2>
            <p className="type-body text-fg-muted">{t("final.lead")}</p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">{ctas}</div>
          </section>
        </div>
      </main>

      <footer className="border-t border-border safe-bottom">
        <div className="mx-auto flex max-w-content flex-col gap-3 px-gutter py-6 sm:flex-row sm:items-center sm:justify-between">
          <LegalLinks />
          <p className="type-caption text-fg-muted">{t("footer.rights", { year })}</p>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <div className="flex max-w-prose flex-col gap-2">
      <h2 id={`${id}-title`} className="type-h1 text-fg">
        {title}
      </h2>
      {lead ? <p className="type-body text-fg-muted">{lead}</p> : null}
    </div>
  );
}
