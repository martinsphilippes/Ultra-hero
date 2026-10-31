import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SocialEditor, type SocialItem } from "@/components/talent/SocialEditor";
import { agencyCan } from "@/lib/agency/roles";
import { listSocial } from "@/lib/talent/queries";
import { loadTalent } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("talentNetworks") };
}

type Props = { params: Promise<{ id: string }> };

// Redes declaradas do talento: cada número com "dados de … · declarado por … em …" (critério 2).
export default async function TalentNetworksPage({ params }: Props) {
  const { id } = await params;
  const { ctx, talent } = await loadTalent(id);
  const accounts = await listSocial(talent.id);
  const canEdit = agencyCan(ctx.role, "manager", ctx.platformAdmin) && !talent.archived;
  return <SocialEditor portal="agency" talentId={talent.id} accounts={accounts as SocialItem[]} canEdit={canEdit} />;
}
