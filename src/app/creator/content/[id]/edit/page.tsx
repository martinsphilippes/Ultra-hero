import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { getManagedCreator } from "../../../_lib/creator";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("creator.content") };
}

// Edição de conteúdo do herói: só o admin, no módulo de conteúdo do admin (receita estruturada
// segue no editor de receitas do portal). O herói comum volta ao Perfil.
export default async function EditContentPage({ params }: Params) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await getManagedCreator("content");
  if (!ctx.creatorId) {
    const tn = await getTranslations("nav");
    return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} title={tn("creator.content")} />;
  }
  const { data } = await ctx.supabase.from("content").select("id, type").eq("id", id).maybeSingle();
  if (!data) notFound();
  redirect(data.type === "recipe" ? `/creator/recipes/${id}/edit` : `/admin/content/${id}`);
}
