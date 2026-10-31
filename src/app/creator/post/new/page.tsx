import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { PostComposer } from "@/components/creator/post/PostComposer";
import { Briefcase } from "lucide-react";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { getRoles, isTalentOnly } from "@/lib/auth/session";
import { getPostPhotoState } from "@/lib/post-photo/availability";
import { PILLARS, type Pillar } from "@/lib/supabase/helpers";
import { getPostingCreator } from "../../_lib/creator";
import { readVideoUploadConfigured } from "../../_lib/video-post";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creator.post");
  return { title: t("title") };
}

// Novo post com foto ou vídeo: a tela abre mesmo sem o Cloudflare configurado (botões de vídeo
// desabilitados e o aviso para ligar o Stream) e a foto segue independente (0043; sem ela, aviso).
export default async function NewPostPage() {
  const [t, tn, ctx, roles] = await Promise.all([getTranslations("creator.post"), getTranslations("nav"), getPostingCreator(), getRoles()]);
  if (isTalentOnly(roles)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} eyebrow={tn("portals.creator")} backHref="/creator/escritorio" backLabel={tn("creator.office")} />
        <div className="rounded-2xl border border-border bg-surface" data-testid="post-talent-only">
          <EmptyState
            icon={<Briefcase />}
            title={t("talentOnly")}
            description={t("talentOnlyHint")}
            action={
              <Button asChild>
                <a href="/creator/escritorio">{tn("creator.office")}</a>
              </Button>
            }
          />
        </div>
      </div>
    );
  }
  if (!ctx.creatorId || !ctx.profile) return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} name={ctx.profile?.name} title={t("title")} />;

  const supabase = ctx.supabase;
  const [configured, photoState] = await Promise.all([readVideoUploadConfigured(supabase), getPostPhotoState()]);
  const first = ctx.profile.pillars?.[0];
  const defaultPillar: Pillar = first && PILLARS.includes(first) ? first : "routine";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tn("portals.creator")} backHref={ctx.acting ? "/creator" : "/profile"} backLabel={ctx.acting ? tn("creator.dashboard") : tn("backToProfile")} />
      <PostComposer configured={configured} photoState={photoState} defaultPillar={defaultPillar} />
    </div>
  );
}
