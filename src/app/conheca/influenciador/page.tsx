import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { INFLUENCER_TEASER_PATH, LaunchTeaser } from "@/components/launch/LaunchTeaser";
import { SeasonalTheme } from "@/components/seasonal-theme/SeasonalTheme";
import { launchTagsFrom } from "@/lib/launch-leads";

// /conheca/influenciador: a porta "Sou influenciador" do teaser de lançamento. Mesma estética, três linhas a mais e o
// @ do Instagram (opcional); o interessado fica marcado como 'influenciador' (launch_leads.kind). Não há porta para
// empresas (pedido do dono).

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("institutional.meta");
  return {
    title: { absolute: t("influencerTitle") },
    description: t("influencerDescription"),
    alternates: { canonical: INFLUENCER_TEASER_PATH },
    openGraph: { type: "website", siteName: "Groscove Ultra", title: t("influencerTitle"), description: t("influencerDescription"), url: INFLUENCER_TEASER_PATH },
    twitter: { card: "summary", title: t("influencerTitle"), description: t("influencerDescription") },
  };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function InfluencerTeaserPage({ searchParams }: Props) {
  const tags = launchTagsFrom(await searchParams, "conheca-influenciador");
  return <LaunchTeaser kind="influenciador" tags={tags} seasonal={<SeasonalTheme area="institutional" />} />;
}
