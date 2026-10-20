import { ArrowRight, Compass, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, StepMark } from "@/components/ui";
import { getProfile, getSessionSummary } from "@/lib/auth/session";
import { PILLARS } from "@/lib/supabase/helpers";
import { cn } from "@/lib/utils";
import { PILLAR_ICON, PILLAR_SOFT, PILLAR_TEXT } from "../pillars";

// Topo do Início: saudação compacta (logado) ou proposta de valor (visitante) + atalhos por pilar.
export async function HomeHero() {
  const [session, profile, t, tp] = await Promise.all([
    getSessionSummary(),
    getProfile(),
    getTranslations("discover.home"),
    getTranslations("common.pillars"),
  ]);
  const needsOnboarding = Boolean(session) && profile?.onboarding_completed === false;

  return (
    <header className="flex flex-col gap-5">
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-7",
          "before:pointer-events-none before:absolute before:-right-24 before:-top-24 before:size-72 before:rounded-full before:bg-accent-soft before:blur-3xl",
        )}
      >
        <div className="relative flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <StepMark />
            <span className="type-overline text-accent-text">{t("eyebrow")}</span>
          </div>

          {session ? (
            <div className="flex flex-col gap-1">
              <h1 className="type-h1 text-balance text-fg">{session.displayName ? t("greeting", { name: session.displayName }) : t("greetingFallback")}</h1>
              <p className="type-body max-w-prose text-fg-muted">{t("greetingSubtitle")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <h1 className="type-h1 text-balance text-fg">{t("visitorTitle")}</h1>
                <p className="type-body max-w-prose text-fg-muted">{t("visitorSubtitle")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild trailingIcon={<ArrowRight />}>
                  <Link href="/signup">{t("ctaSignup")}</Link>
                </Button>
                <Button asChild variant="secondary" leadingIcon={<Compass />}>
                  <Link href="/explore">{t("ctaExplore")}</Link>
                </Button>
              </div>
            </div>
          )}

          {needsOnboarding && (
            <Link
              href="/onboarding"
              className="group flex items-center gap-3 rounded-xl border border-accent/30 bg-accent-soft/60 p-3 pr-4 transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface text-accent-text shadow-sm">
                <Sparkles className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold text-fg">{t("onboarding.title")}</span>
                <span className="type-caption text-fg-muted">{t("onboarding.description")}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text">
                {t("onboarding.cta")}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          )}
        </div>
      </div>

      {/* Atalhos por pilar: cores e ícones próprios de cada pilar */}
      <nav aria-label={t("pillarsNav")} className="-mx-gutter overflow-x-auto px-gutter scrollbar-none">
        <ul className="flex gap-2 md:grid md:grid-cols-4">
          {PILLARS.map((pillar) => {
            const Icon = PILLAR_ICON[pillar];
            return (
              <li key={pillar} className="shrink-0 md:shrink">
                <Link
                  href={`/explore?pillar=${pillar}`}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold text-fg transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-sm",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                    PILLAR_SOFT[pillar],
                  )}
                >
                  <Icon className={cn("size-4", PILLAR_TEXT[pillar])} aria-hidden="true" />
                  {tp(pillar)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
