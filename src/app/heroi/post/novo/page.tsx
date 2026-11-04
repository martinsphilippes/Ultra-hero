import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { CampaignBanner } from "@/components/hero-work/CampaignBanner";
import { PostComposer } from "@/components/creator/post/PostComposer";
import { Briefcase } from "lucide-react";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { getRoles, isTalentOnly } from "@/lib/auth/session";
import { loadComposerOptions } from "@/lib/post-blocks/queries";
import { getPostPhotoState } from "@/lib/post-photo/availability";
import { PILLARS, type Pillar } from "@/lib/supabase/helpers";
import { getPostingCreator } from "../../_lib/creator";
import { readVideoUploadConfigured } from "../../_lib/video-post";
import { CAPTION_MAX } from "@/components/creator/post/validation";
import { campaignCaption, parsePostMode } from "@/lib/hero-work/campaign";
import { loadHeroCampaign } from "@/lib/hero-work/campaign-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creator.post");
  return { title: t("title") };
}

type Props = { searchParams: Promise<{ campanha?: string; tipo?: string }> };

// Novo post com foto ou vídeo: a tela abre mesmo sem o Cloudflare configurado (botões de vídeo
// desabilitados e o aviso para ligar o Stream) e a foto segue independente (0043; sem ela, aviso).
// ?campanha= (pedido do responsável, 04/11): vindo da campanha, faixa com o briefing, legenda com as marcas
// obrigatórias, ?tipo=video|foto em destaque e, publicado, a volta para a campanha (ver lib/hero-work/campaign).
export default async function NewPostPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [t, tn, ctx, roles, campaign] = await Promise.all([getTranslations("creator.post"), getTranslations("nav"), getPostingCreator(), getRoles(), loadHeroCampaign(sp.campanha)]);
  if (isTalentOnly(roles)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} eyebrow={tn("portals.creator")} backHref="/heroi" backLabel={tn("creator.home")} />
        <div className="rounded-2xl border border-border bg-surface" data-testid="post-talent-only">
          <EmptyState
            icon={<Briefcase />}
            title={t("talentOnly")}
            description={t("talentOnlyHint")}
            action={
              <Button asChild>
                <a href="/heroi">{tn("creator.home")}</a>
              </Button>
            }
          />
        </div>
      </div>
    );
  }
  if (!ctx.creatorId || !ctx.profile) return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} name={ctx.profile?.name} title={t("title")} />;

  const supabase = ctx.supabase;
  const [configured, photoState, blockOptions] = await Promise.all([readVideoUploadConfigured(supabase), getPostPhotoState(), loadComposerOptions(supabase, ctx.creatorId)]);
  const first = ctx.profile.pillars?.[0];
  const defaultPillar: Pillar = first && PILLARS.includes(first) ? first : "routine";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tn("portals.creator")} backHref={ctx.acting ? "/heroi" : "/profile"} backLabel={ctx.acting ? tn("creator.dashboard") : tn("backToProfile")} />
      {campaign ? <CampaignBanner campaign={campaign} /> : null}
      <PostComposer
        configured={configured}
        photoState={photoState}
        defaultPillar={defaultPillar}
        blockOptions={blockOptions}
        blockHrefs={{ newRecipe: "/heroi/receitas/nova", links: "/heroi/vinculos" }}
        campaign={campaign ? { id: campaign.id, caption: campaignCaption(campaign, CAPTION_MAX), mode: parsePostMode(sp.tipo) } : null}
      />
    </div>
  );
}
