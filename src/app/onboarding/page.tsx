import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { InterestGroup } from "@/components/me/InterestTagGrid";
import { OnboardingWizard } from "@/components/me/OnboardingWizard";
import { PageHeader } from "@/components/ui";
import { isLocale, type Locale } from "@/i18n/config";
import { getProfile, requireUser } from "@/lib/auth/session";
import { localizedLabel } from "@/lib/catalog/queries";
import { PILLARS, type Pillar } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { resolveTheme } from "@/lib/theme/constants";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("onboarding") };
}

// Onboarding (opcional, exige sessão): mesma grade de interesses do perfil + idioma/tema.
export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const [profile, locale, t, tc] = await Promise.all([getProfile(), getLocale(), getTranslations("me.onboarding"), getTranslations("common")]);
  const supabase = await createClient();
  const [tagsRes, mineRes] = await Promise.all([
    supabase.from("interest_tags").select("tag, label, pillar, sort_order").order("sort_order", { ascending: true }),
    supabase.from("user_interests").select("tag").eq("user_id", user.id),
  ]);
  if (tagsRes.error) throw new Error(tagsRes.error.message);

  const uiLocale: Locale = isLocale(profile?.locale) ? profile.locale : (locale as Locale);
  const byPillar = new Map<Pillar | null, InterestGroup["tags"]>();
  for (const row of tagsRes.data ?? []) {
    const key = (row.pillar as Pillar | null) ?? null;
    if (!byPillar.has(key)) byPillar.set(key, []);
    byPillar.get(key)!.push({ tag: row.tag, label: localizedLabel(row.label, uiLocale) || row.tag });
  }
  const groups: InterestGroup[] = [...PILLARS, null].filter((p) => byPillar.has(p)).map((pillar) => ({ pillar, tags: byPillar.get(pillar)! }));
  const theme = resolveTheme(profile?.theme);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} />
      <div className="rounded-2xl border border-border bg-surface p-5">
        <OnboardingWizard groups={groups} initialTags={(mineRes.data ?? []).map((r) => r.tag)} initialLocale={uiLocale} initialTheme={theme} />
      </div>
    </div>
  );
}
