import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { CreatorContentEditor } from "@/components/creator/content/CreatorContentEditor";
import { PageHeader } from "@/components/ui";
import { hasRole } from "@/lib/auth/session";
import { loadComposerOptions } from "@/lib/post-blocks/queries";
import { getPostPhotoState } from "@/lib/post-photo/availability";
import { getContentWorkspace, getManagedCreator } from "../../_lib/creator";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creator.newContent");
  return { title: t("title") };
}

// Novo conteúdo (0092). O creator (titular ou membro da equipe do herói ativo) cria o conteúdo estruturado aqui,
// no mesmo editor por blocos do admin, com o herói dele fixo (vários heróis: seletor). O admin continua no editor
// do admin com o herói escolhido já selecionado (sem mudança).
export default async function NewContentPage() {
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

  const [coverState, options] = await Promise.all([getPostPhotoState(), loadComposerOptions(ctx.supabase, ctx.creatorId)]);
  const defaultHero = ctx.heroes.find((h) => h.id === ctx.defaultHeroId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description", { name: ctx.profile.name })} eyebrow={tn("portals.creator")} backHref="/heroi/conteudos" backLabel={tn("creator.content")} />
      <CreatorContentEditor
        mode="create"
        heroId={ctx.creatorId}
        heroes={ctx.heroes}
        defaultHero={defaultHero ? { id: defaultHero.id, name: defaultHero.name } : null}
        coverState={coverState}
        options={options}
      />
    </div>
  );
}
