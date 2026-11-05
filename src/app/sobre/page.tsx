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
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { legalRichTags } from "@/components/legal/rich-tags";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { Logo, LogoMark } from "@/components/layout/Logo";
import { SeasonalTheme } from "@/components/seasonal-theme/SeasonalTheme";
import { FIXED_APPEARANCE_SCRIPT, FixedAppearance } from "@/components/about-classic/FixedAppearance";
import { LogoInterlude } from "@/components/about-classic/LogoInterlude";
import { Shine, ShineLine } from "@/components/about-classic/Shine";
import { ProfileSwitcher, type SwitcherProfile } from "@/components/about-classic/ProfileSwitcher";
import { Reveal } from "@/components/about-classic/Reveal";
import { TiltCard } from "@/components/about-classic/TiltCard";
import { Button } from "@/components/ui";
import { LOGIN_HOME } from "@/lib/auth/safe-next";
import { getUser } from "@/lib/auth/session";
import { CALENDAR_POINTS, FAQ_ITEMS, FEATURE_GROUPS, HOW_STEPS, SECTION_ANCHORS, WHAT_ITEMS } from "@/lib/about-classic/content";
import { ABOUT_ENABLED, ABOUT_PATH, INSTITUTIONAL_EXPLORE_PATH, INSTITUTIONAL_LOGIN_HREF, INSTITUTIONAL_SIGNUP_HREF } from "@/lib/institutional/root";
import { getNativeApp } from "@/lib/native-app/server";
import "./sobre.css";

// /sobre · "Conheça o Groscove Ultra": a apresentação completa (Hero, Marca, Agência e o app) para quem já está no
// app. É a antiga página institucional da /conheca (branch ultra-classico), restaurada com o mesmo conteúdo e as
// mesmas animações quando a /conheca virou o teaser de lançamento (pedido do dono, 05/11: os dois em lugares
// diferentes). Pública (sem login); no domínio de marketing (MARKETING_HOSTS) não existe (volta ao teaser). No app das
// lojas é a porta de entrada de quem não entrou; lá não há "Pular e explorar", porque o app só entra com login.
// Textos em messages/<locale>/aboutClassic.json (namespace próprio: institutional.json é do teaser); classes e
// animações com prefixo uh-sb- (sobre.css) para não colidir com a abertura do app (intro.css) nem com o teaser.
// Só funcionalidades que existem (src/lib/about-classic/content.ts); pagamentos e compras: "ainda não ativados".
// Animações: logo de abertura que surge e se encaixa, cartões que surgem ao rolar, recursos entrando de um lado e
// do outro, faixa contínua, logomarca entre um perfil e outro e o seletor "Eu sou…". "Reduzir movimento" desliga tudo.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("aboutClassic.meta");
  return {
    title: { absolute: t("title") },
    description: t("description"),
    alternates: { canonical: ABOUT_PATH },
    openGraph: { type: "website", siteName: "Groscove Ultra", title: t("title"), description: t("description"), url: ABOUT_PATH },
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

export default async function AboutClassicPage() {
  if (!ABOUT_ENABLED) notFound();
  const [t, user, nativeApp] = await Promise.all([getTranslations("aboutClassic"), getUser(), getNativeApp()]);
  const signedIn = user !== null;
  const canExplore = !signedIn && nativeApp === null;
  const year = new Date().getFullYear();

  // Logado que abriu /sobre: um só botão para o app (não muda nada da autenticação).
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

  // "Eu sou…": cada perfil com 3 destaques reais (os primeiros recursos do grupo) e o atalho para a seção dele
  const groupOf = { brand: "brands", hero: "heroes", agency: "agency", app: "app" } as const;
  const profiles: SwitcherProfile[] = (["brand", "hero", "agency", "app"] as const).map((key) => {
    const g = FEATURE_GROUPS.find((x) => x.ns === groupOf[key])!;
    const label = key === "app" ? t("switcher.app") : t(`what.items.${key}.title`);
    return {
      key,
      label,
      title: t(`${g.ns}.title`),
      lead: t(`${g.ns}.lead`),
      href: `#${g.id}`,
      cta: t("switcher.seeAll", { name: label }),
      highlights: g.items.slice(0, 3).map((it) => ({ title: t(`${g.ns}.items.${it.key}.title`), body: t(`${g.ns}.items.${it.key}.body`) })),
    };
  });
  // faixa contínua: todos os recursos, duplicados para o laço sem emenda
  const marquee = FEATURE_GROUPS.flatMap((g) => g.items.map((it) => ({ id: `${g.ns}.${it.key}`, title: t(`${g.ns}.items.${it.key}.title`) })));
  const titleWords = t("hero.title").split(" ");

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      {/* aparência fixa: Perspectivas Petróleo no claro (antes da pintura e também na navegação pelo app) */}
      <script dangerouslySetInnerHTML={{ __html: FIXED_APPEARANCE_SCRIPT }} />
      <FixedAppearance />
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md safe-top">
        <ShineLine edge="bottom" delay={2.3} />
        <div className="mx-auto flex h-topbar max-w-content items-center justify-between gap-3 px-gutter">
          <Link href={ABOUT_PATH} aria-label={t("nav.home")} className={`relative isolate inline-flex rounded-lg ${focusRing}`}>
            <Logo size="md" className="block" />
            <Shine kind="logo" delay={1.8} />
          </Link>
          <div className="flex items-center gap-0.5">
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

        {/* Abertura: a logo surge grande e se encaixa; o título entra palavra por palavra; ao lado, o seletor "Eu sou…" */}
        <section aria-labelledby="inst-hero" className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-accent/20 to-transparent" />
          <div aria-hidden="true" className="uh-sb-glow pointer-events-none absolute -left-24 top-24 size-72 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative mx-auto flex max-w-content flex-col gap-8 px-gutter pb-10 pt-8 md:flex-row md:items-start md:gap-12 md:pb-16 md:pt-14">
            <div className="flex flex-1 flex-col gap-5">
              <div aria-hidden="true" className="relative flex size-24 items-center justify-center">
                <span className="uh-sb-glow absolute inset-0 rounded-full bg-accent/30 blur-2xl" />
                <span className="uh-sb-breathe relative isolate">
                  <LogoMark className="uh-sb-intro-mark block h-16" />
                  <Shine kind="mark" delay={2.7} />
                </span>
              </div>
              <p className="uh-sb-pop type-overline text-accent-text" style={{ animationDelay: "500ms" }}>
                {t("hero.eyebrow")}
              </p>
              <h1 id="inst-hero" className="type-display max-w-[20ch] text-balance text-fg" aria-label={t("hero.title")}>
                {titleWords.map((w, i) => (
                  <span key={i} aria-hidden="true" className="uh-sb-intro-word" style={{ animationDelay: `${600 + i * 70}ms` }}>
                    {w}
                    {i < titleWords.length - 1 ? "\u00a0" : ""}
                  </span>
                ))}
              </h1>
              <p className="uh-sb-pop type-body max-w-prose text-fg-muted md:text-lg" style={{ animationDelay: `${700 + titleWords.length * 70}ms` }}>
                {t("hero.lead")}
              </p>
              {signedIn ? <p className="type-body-sm text-fg-muted">{t("hero.signedIn")}</p> : null}
              <div className="uh-sb-pop flex flex-col gap-3 sm:flex-row sm:flex-wrap" style={{ animationDelay: `${850 + titleWords.length * 70}ms` }}>
                {ctas}
              </div>
              {canExplore ? (
                // <a> comum (sem prefetch): o handler grava a escolha só quando a pessoa clica
                <a
                  href={INSTITUTIONAL_EXPLORE_PATH}
                  data-testid="institutional-skip"
                  className={`inline-flex min-h-11 w-fit items-center gap-1 rounded-md text-sm font-semibold text-accent-text underline-offset-4 hover:underline ${focusRing}`}
                >
                  {t("nav.skip")}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              ) : null}
            </div>
            <Reveal from="right" delay={250} className="w-full md:max-w-md md:flex-1">
              <ProfileSwitcher label={t("switcher.label")} profiles={profiles} />
            </Reveal>
          </div>
        </section>

        {/* Faixa contínua de recursos passando de um lado ao outro (decorativa; pausa ao passar o mouse) */}
        <div aria-hidden="true" className="uh-sb-marquee relative overflow-hidden border-y border-border bg-surface/60 py-3">
          <ShineLine edge="top" delay={3.1} />
          <ShineLine edge="bottom" delay={3.1} />
          <div className="uh-sb-marquee-track flex w-max gap-3">
            {[...marquee, ...marquee].map((m, i) => (
              <span key={`${m.id}-${i}`} className="inline-flex items-center gap-2 rounded-full border border-border bg-bg px-4 py-2 text-sm font-semibold text-fg">
                <LogoMark className="h-3.5" />
                {m.title}
              </span>
            ))}
          </div>
        </div>

        {/* Navegação interna (rolável no celular) */}
        <nav aria-label={t("nav.sections")} className="relative border-y border-border bg-surface/60">
          <ShineLine edge="top" delay={3.5} />
          <ShineLine edge="bottom" delay={3.5} />
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
              {WHAT_ITEMS.map((key, i) => {
                const Icon = WHAT_ICONS[key];
                return (
                  <Reveal key={key} as="li" from="up" delay={i * 140}>
                    <TiltCard className="uh-sb-card flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-5 shadow-sm hover:shadow-md">
                      <span className="flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent-text">
                        <Icon className="size-6" aria-hidden="true" />
                      </span>
                      <h3 className="type-h3 text-fg">{t(`what.items.${key}.title`)}</h3>
                      <p className="type-body-sm text-fg-muted">{t(`what.items.${key}.body`)}</p>
                    </TiltCard>
                  </Reveal>
                );
              })}
            </ul>
          </section>

          {/* Como funciona */}
          <section aria-labelledby="como-funciona-title" id="como-funciona" className="flex scroll-mt-20 flex-col gap-6">
            <SectionHead id="como-funciona" title={t("how.title")} lead={t("how.lead")} />
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {HOW_STEPS.map((key, i) => (
                <Reveal key={key} as="li" from={i % 2 === 0 ? "left" : "right"} delay={(i % 3) * 120} className="flex gap-4 rounded-xl border border-border bg-surface p-5">
                  <span aria-hidden="true" className="type-numeric flex size-10 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-sm font-semibold text-accent-fg">
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="type-h3 text-fg">{t(`how.steps.${key}.title`)}</h3>
                    <p className="type-body-sm text-fg-muted">{t(`how.steps.${key}.body`)}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
            <p className="type-body-sm rounded-xl border border-accent/30 bg-accent/10 p-4 text-fg">{t("how.note")}</p>
          </section>

          {/* Heros, Marcas, Agência, App */}
          {FEATURE_GROUPS.map((group) => (
            <div key={group.id} className="flex flex-col gap-10">
              {/* entre um perfil e outro: a logomarca diminui, aumenta e fixa */}
              <LogoInterlude label={t(`interlude.${group.ns}`)} />
            <section aria-labelledby={`${group.id}-title`} id={group.id} className="flex scroll-mt-20 flex-col gap-6">
              <SectionHead id={group.id} title={t(`${group.ns}.title`)} lead={t(`${group.ns}.lead`)} />
              {/* 4 recursos: 4 colunas no desktop (sem cartão sozinho na última linha); 6: 3 colunas */}
              <ul className={`grid gap-3 sm:grid-cols-2 ${group.items.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
                {group.items.map((item, i) => {
                  const Icon = FEATURE_ICONS[`${group.ns}.${item.key}`] ?? Sparkles;
                  return (
                    <Reveal key={item.key} as="li" from={i % 2 === 0 ? "left" : "right"} delay={(i % 3) * 110} className="flex gap-4 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/40">
                      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent-text">
                        <Icon className="size-5" />
                      </span>
                      <div className="flex flex-col gap-1">
                        <h3 className="type-h3 text-fg">{t(`${group.ns}.items.${item.key}.title`)}</h3>
                        <p className="type-body-sm text-fg-muted">{t(`${group.ns}.items.${item.key}.body`)}</p>
                      </div>
                    </Reveal>
                  );
                })}
              </ul>
              {group.ns === "app" && nativeApp === null ? (
                <a href={INSTITUTIONAL_EXPLORE_PATH} className={`inline-flex min-h-11 w-fit items-center gap-1 rounded-md text-sm font-semibold text-accent-text underline-offset-4 hover:underline ${focusRing}`}>
                  {t("app.cta")}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              ) : null}
            </section>
            </div>
          ))}

          {/* Calendário Groscove */}
          <section aria-labelledby="calendario-title" id="calendario" className="scroll-mt-20">
            <Reveal from="zoom" className="clip-step flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 md:flex-row md:items-start md:gap-10 md:p-10">
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
            </Reveal>
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
          <section aria-labelledby="comecar-title" className="relative flex flex-col items-start gap-4 overflow-hidden rounded-2xl bg-accent/10 p-6 md:items-center md:p-12 md:text-center">
            <span aria-hidden="true" className="uh-sb-breathe uh-sb-shine-faint pointer-events-none absolute -bottom-10 -right-10 isolate">
              <LogoMark className="block h-48 opacity-10" />
              <Shine kind="mark" delay={5.6} />
            </span>
            <h2 id="comecar-title" className="type-h1 text-fg">
              {t("final.title")}
            </h2>
            <p className="type-body text-fg-muted">{t("final.lead")}</p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">{ctas}</div>
          </section>
        </div>
      </main>

      <footer className="relative border-t border-border safe-bottom">
        <ShineLine edge="top" delay={6} />
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
