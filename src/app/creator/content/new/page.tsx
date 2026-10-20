import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CreatorContentForm } from "@/components/creator/CreatorContentForm";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { PageHeader } from "@/components/ui";
import { getMyCreator } from "../../_lib/creator";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creator.content");
  return { title: t("new") };
}

// Novo conteúdo: rascunho da personalidade (sem campos de acesso; o admin define depois).
export default async function NewContentPage() {
  const [t, tn, ctx] = await Promise.all([getTranslations("creator"), getTranslations("nav"), getMyCreator()]);
  if (!ctx.creatorId) return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} name={ctx.profile?.name} title={t("content.new")} />;
  const defaultPillar = ctx.profile?.pillars?.[0] ?? "routine";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("content.new")} description={t("content.newDescription")} eyebrow={tn("creator.content")} backHref="/creator/content" backLabel={tn("creator.content")} />
      <CreatorContentForm mode="create" initial={{ pillar: defaultPillar, source_locale: "pt-BR", type: "video" }} />
    </div>
  );
}
