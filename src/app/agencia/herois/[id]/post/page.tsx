import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { readVideoUploadConfigured } from "@/app/creator/_lib/video-post";
import { PostComposer } from "@/components/creator/post/PostComposer";
import { PageHeader } from "@/components/ui";
import { actingClient, getActingHero } from "@/lib/acting-hero/server";
import { requireAgency } from "@/lib/agency/server";
import { getPostPhotoState } from "@/lib/post-photo/availability";
import { PILLARS, type Pillar } from "@/lib/supabase/helpers";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creator.post");
  return { title: t("title") };
}

// Novo post da agência em nome do herói escolhido (0070): o mesmo composer do herói; as actions agem
// pelo herói escolhido e o banco confere o vínculo agência ↔ herói.
export default async function AgencyHeroPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAgency("manager");
  const { id } = await params;
  const acting = await getActingHero();
  if (acting.status !== "ok" || acting.hero.id !== id) redirect("/agencia/herois");
  const [t, th, supabase, photoState] = await Promise.all([getTranslations("creator.post"), getTranslations("agency.heroes"), actingClient(id), getPostPhotoState()]);
  const [{ data: hero }, configured] = await Promise.all([supabase.from("creator_profiles").select("pillars").eq("id", id).maybeSingle(), readVideoUploadConfigured(supabase)]);
  const first = hero?.pillars?.[0];
  const defaultPillar: Pillar = first && PILLARS.includes(first) ? first : "routine";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={th("postAs", { name: acting.hero.name })} backHref={`/agencia/herois/${id}`} backLabel={acting.hero.name} />
      <PostComposer configured={configured} photoState={photoState} defaultPillar={defaultPillar} />
    </div>
  );
}
