import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { CreatorContentEditor } from "@/components/creator/content/CreatorContentEditor";
import { CampaignBanner } from "@/components/hero-work/CampaignBanner";
import { PageHeader } from "@/components/ui";
import { hasRole } from "@/lib/auth/session";
import { campaignCaption, parseContentBlock } from "@/lib/hero-work/campaign";
import { loadHeroCampaign } from "@/lib/hero-work/campaign-server";
import { loadComposerOptions } from "@/lib/post-blocks/queries";
import { emptyDrafts } from "@/lib/post-blocks/schema";
import { getPostPhotoState } from "@/lib/post-photo/availability";
import { getContentWorkspace, getManagedCreator } from "../../_lib/creator";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creator.newContent");
  return { title: t("title") };
}

type Props = { searchParams: Promise<{ campanha?: string; bloco?: string }> };

// Resumo do conteúdo estruturado (content.summary, até 600; ver editors/content/schema).
const SUMMARY_MAX = 600;

// Novo conteúdo (0092). O creator (titular ou membro da equipe do Hero ativo) cria o conteúdo estruturado aqui,
// no mesmo editor por blocos do admin, com o Hero dele fixo (vários Heros: seletor). O admin continua no editor
// do admin com o Hero escolhido já selecionado (sem mudança).
// ?campanha= (pedido do responsável, 04/11): faixa da campanha, resumo com as marcas obrigatórias do briefing e
// ?bloco=treino|programa já no pilar Treino (programa: o único programa publicado do Hero já escolhido; com mais de
// um, ele escolhe no bloco). O rascunho segue para o editor com o mesmo contexto (publicado, volta para a campanha).
export default async function NewContentPage({ searchParams }: Props) {
  const sp = await searchParams;
  if (await hasRole("admin")) {
    const ctx = await getManagedCreator("newContent");
    if (!ctx.creatorId) {
      const t = await getTranslations("creator.content");
      return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} title={t("new")} />;
    }
    redirect(`/admin/content/new?creator=${encodeURIComponent(ctx.creatorId)}`);
  }

  const [t, tn, ctx] = await Promise.all([getTranslations("creator.newContent"), getTranslations("nav"), getContentWorkspace("newContent", { followChoice: true })]);
  if (!ctx.creatorId || !ctx.profile) return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} name={ctx.profile?.name} title={t("title")} />;

  const [coverState, options, campaign] = await Promise.all([getPostPhotoState(), loadComposerOptions(ctx.supabase, ctx.creatorId), loadHeroCampaign(sp.campanha)]);
  const block = campaign ? parseContentBlock(sp.bloco) : null;
  const drafts = emptyDrafts();
  const onlyProgram = block === "program" && options.programs.length === 1 ? options.programs[0] : undefined;
  if (onlyProgram) drafts.program = { program_id: onlyProgram.id, note: "" };
  const defaultHero = ctx.heroes.find((h) => h.id === ctx.defaultHeroId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description", { name: ctx.profile.name })} eyebrow={tn("portals.creator")} backHref="/heroi/conteudos" backLabel={tn("creator.content")} />
      {campaign ? <CampaignBanner campaign={campaign} note={block === "program" && !onlyProgram ? t("campaignProgramNote") : null} /> : null}
      <CreatorContentEditor
        mode="create"
        campaignId={campaign?.id ?? null}
        initial={campaign ? { summary: campaignCaption(campaign, SUMMARY_MAX), pillar: block ? "training" : undefined } : undefined}
        initialBlocks={campaign ? { drafts, products: [] } : undefined}
        heroId={ctx.creatorId}
        heroes={ctx.heroes}
        defaultHero={defaultHero ? { id: defaultHero.id, name: defaultHero.name } : null}
        coverState={coverState}
        options={options}
      />
    </div>
  );
}
