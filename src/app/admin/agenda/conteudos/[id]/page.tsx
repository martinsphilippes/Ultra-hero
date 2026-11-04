import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PostEditorPage } from "@/components/editorial/PostEditorPage";
import { getEditorialPost } from "@/lib/culture/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("culture.editorial");
  return { title: t("edit") };
}

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getEditorialPost(id, null);
  if (!post) notFound();
  return <PostEditorPage scope="platform" base="/admin/agenda/conteudos" post={post} />;
}
