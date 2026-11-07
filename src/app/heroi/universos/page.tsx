import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { UniversePicker } from "@/components/creator-guide/UniversePicker";
import { PageHeader } from "@/components/ui";
import { loadCreatorGuide, loadUniverseCatalog } from "@/lib/creator-guide/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creatorGuide.meta");
  return { title: t("universes") };
}

// Universos (0136): segmentos e marcas com que a Groscove Group trabalha. O creator do casting marca o que faz
// sentido, o que já conhece e o que quer explorar; a equipe vê na ficha. Marcar não é aprovação de campanha.
export default async function UniversesPage() {
  const [t, guide, catalog] = await Promise.all([getTranslations("creatorGuide"), loadCreatorGuide(), loadUniverseCatalog()]);
  return (
    <div className="flex flex-col gap-5" data-testid="creator-universes">
      <PageHeader title={t("universes.title")} description={t("universes.lead")} backHref="/heroi/como-trabalhamos" backLabel={t("meta.title")} />
      <p className="type-caption text-fg-muted">{t("universes.note")}</p>
      {guide && catalog ? (
        <UniversePicker
          categories={catalog.categories}
          brands={catalog.brands}
          initial={{ universes: guide.universes, known: guide.brandsKnown, explore: guide.brandsExplore }}
        />
      ) : (
        <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg">{t("notInCasting")}</p>
      )}
    </div>
  );
}
