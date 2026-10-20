import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ContinueSection } from "@/components/discover/home/ContinueSection";
import { FeaturedSection } from "@/components/discover/home/FeaturedSection";
import { HomeHero } from "@/components/discover/home/HomeHero";
import { PersonalitiesStrip } from "@/components/discover/home/PersonalitiesStrip";
import { PillarSection } from "@/components/discover/home/PillarSection";
import { SectionSkeleton } from "@/components/discover/SectionSkeleton";
import { RecommendationsSection } from "@/components/home/RecommendationsSection";
import { getUser } from "@/lib/auth/session";
import { PILLARS } from "@/lib/supabase/helpers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("discover.meta");
  return { title: t("home") };
}

// Início: content-first. Cada seção busca seus dados num Suspense próprio para não travar a página.
export default async function HomePage() {
  const [user, t] = await Promise.all([getUser(), getTranslations("discover.common")]);

  return (
    <div className="flex flex-col gap-10">
      <HomeHero />

      <Suspense fallback={<SectionSkeleton cards={3} />}>
        <FeaturedSection />
      </Suspense>

      {user && (
        <Suspense fallback={<SectionSkeleton layout="scroll" cards={3} />}>
          <ContinueSection userId={user.id} />
        </Suspense>
      )}

      <Suspense fallback={<SectionSkeleton layout="scroll" cards={3} />}>
        <RecommendationsSection userId={user?.id ?? null} />
      </Suspense>

      {PILLARS.map((pillar) => (
        <Suspense key={pillar} fallback={<SectionSkeleton layout="rail" cards={4} />}>
          <PillarSection pillar={pillar} />
        </Suspense>
      ))}

      <Suspense fallback={<SectionSkeleton layout="scroll" cards={3} />}>
        <PersonalitiesStrip />
      </Suspense>

      <p className="type-caption max-w-prose text-fg-subtle">{t("educationalNote")}</p>
    </div>
  );
}
