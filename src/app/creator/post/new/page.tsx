import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { PostComposer } from "@/components/creator/post/PostComposer";
import { PageHeader } from "@/components/ui";
import { PILLARS, type Pillar } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { getMyCreator } from "../../_lib/creator";
import { readVideoUploadConfigured } from "../../_lib/video-post";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creator.post");
  return { title: t("title") };
}

// Novo post em vídeo: a tela abre mesmo sem o Cloudflare configurado, com os botões de vídeo
// desabilitados e o aviso para o administrador ligar o Stream.
export default async function NewPostPage() {
  const [t, tn, ctx] = await Promise.all([getTranslations("creator.post"), getTranslations("nav"), getMyCreator()]);
  if (!ctx.creatorId || !ctx.profile) return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} name={ctx.profile?.name} title={t("title")} />;

  const supabase = await createClient();
  const configured = await readVideoUploadConfigured(supabase);
  const first = ctx.profile.pillars?.[0];
  const defaultPillar: Pillar = first && PILLARS.includes(first) ? first : "routine";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tn("portals.creator")} backHref="/creator" backLabel={tn("creator.dashboard")} />
      <PostComposer configured={configured} defaultPillar={defaultPillar} />
    </div>
  );
}
