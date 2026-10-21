import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { RecipeOnboardingWizard } from "@/components/recipes/RecipeOnboardingWizard";
import { PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { requireUser } from "@/lib/auth/session";
import { loadInterestGroups } from "@/lib/catalog/interest-groups";
import { getRecipeGate } from "@/lib/recipes/gate";
import { safeNext } from "@/lib/recipes/onboarding";

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("recipes.onboarding");
  return { title: t("metaTitle") };
}

// Etapa demonstrativa de receitas (exige sessão: o middleware manda o visitante ao login e volta).
export default async function RecipeOnboardingPage({ searchParams }: Props) {
  const raw = (await searchParams).next;
  const next = safeNext(Array.isArray(raw) ? raw[0] : raw);
  const user = await requireUser(`/recipes/onboarding?next=${encodeURIComponent(next)}`);
  const [t, locale, gate] = await Promise.all([getTranslations("recipes.onboarding"), getLocale(), getRecipeGate()]);
  const { groups, selected } = await loadInterestGroups(user.id, locale as Locale);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader backHref={next} backLabel={t("cancel")} eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
      <RecipeOnboardingWizard
        next={next}
        groups={groups}
        initialInterests={selected}
        initialRestrictions={gate.restrictions}
        initialAllergies={gate.allergies}
        alreadyCompleted={gate.completed}
      />
    </div>
  );
}
