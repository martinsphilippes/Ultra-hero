import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LaunchTeaser } from "@/components/launch/LaunchTeaser";
import { SeasonalTheme } from "@/components/seasonal-theme/SeasonalTheme";
import { INSTITUTIONAL_PATH, TEASER_ENABLED } from "@/lib/institutional/root";
import { launchTagsFrom } from "@/lib/launch-leads";

// /conheca: teaser oficial de lançamento (pedido do dono, 04/11; substitui a apresentação que explicava Hero, Marca e
// Agência). Visitante sem sessão chega aqui pelo "/" (middleware); num domínio próprio de marketing (MARKETING_HOSTS)
// o "/" mostra esta página direto. O teaser em si mora em src/components/launch/LaunchTeaser.tsx (a porta do
// influenciador, /conheca/influenciador, usa o mesmo). Sem spoiler do produto nos metadados.

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

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LaunchTeaserPage({ searchParams }: Props) {
  if (!TEASER_ENABLED) notFound();
  const tags = launchTagsFrom(await searchParams, "conheca");
  return <LaunchTeaser kind="publico" tags={tags} seasonal={<SeasonalTheme area="institutional" />} />;
}
