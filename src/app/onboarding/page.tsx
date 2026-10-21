import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { OnboardingWizard } from "@/components/me/OnboardingWizard";
import { PageHeader } from "@/components/ui";
import { isLocale, type Locale } from "@/i18n/config";
import { getProfile, requireUser } from "@/lib/auth/session";
import { loadInterestGroups } from "@/lib/catalog/interest-groups";
import { resolveTheme } from "@/lib/theme/constants";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("onboarding") };
}

// Onboarding (opcional, exige sessão): mesma grade de interesses do perfil + idioma/tema.
export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const [profile, locale, t, tc] = await Promise.all([getProfile(), getLocale(), getTranslations("me.onboarding"), getTranslations("common")]);
  const uiLocale: Locale = isLocale(profile?.locale) ? profile.locale : (locale as Locale);
  const { groups, selected } = await loadInterestGroups(user.id, uiLocale);
  const theme = resolveTheme(profile?.theme);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} />
      <div className="rounded-2xl border border-border bg-surface p-5">
        <OnboardingWizard groups={groups} initialTags={selected} initialLocale={uiLocale} initialTheme={theme} />
      </div>
    </div>
  );
}
