import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { getManagedCreator } from "../../_lib/creator";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creator.content");
  return { title: t("new") };
}

// Novo conteúdo: só o admin cria, no editor do admin com o herói escolhido já selecionado.
// O herói comum volta ao Perfil (o Novo post continua dele).
export default async function NewContentPage() {
  const ctx = await getManagedCreator("newContent");
  if (!ctx.creatorId) {
    const t = await getTranslations("creator.content");
    return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} title={t("new")} />;
  }
  redirect(`/admin/content/new?creator=${encodeURIComponent(ctx.creatorId)}`);
}
