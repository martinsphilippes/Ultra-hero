import type { Metadata } from "next";
import { ArrowLeft, Eye } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { loadRecipeCategories } from "@/app/creator/recipes/_lib/load";
import { RecipeView } from "@/components/recipes/view/RecipeView";
import { loadRecipeView } from "@/components/recipes/view/load-recipe-view";
import { Button } from "@/components/ui";
import { getUser } from "@/lib/auth/session";
import { isLive } from "@/lib/recipes/media";
import { hasRecipeDetails } from "@/lib/recipes/rows";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.content.detail");
  return { title: t("previewTitle"), robots: { index: false, follow: false } };
}

type Content = {
  id: string;
  title: string;
  summary: string | null;
  difficulty: "beginner" | "intermediate" | "advanced" | null;
  status: "draft" | "published" | "archived";
  publish_at: string | null;
  cover_url: string | null;
  type: string;
  creator: { slug: string; name: string; avatar_url: string | null; is_fictional: boolean } | null;
};

// Prévia da receita estruturada para o admin (revisão antes de publicar): o mesmo RecipeView da
// página pública e da prévia do chef, lido com o cliente do admin (a RLS libera rascunho, agendada,
// foto de etapa e nutrição pendente ao admin). A área /admin já exige o papel admin no layout.
export default async function AdminRecipePreviewPage({ params }: Params) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data } = await supabase
    .from("content")
    .select("id, title, summary, difficulty, status, publish_at, cover_url, type, creator:creator_profiles(slug, name, avatar_url, is_fictional)")
    .eq("id", id)
    .maybeSingle();
  const content = data as unknown as Content | null;
  if (!content || content.type !== "recipe" || !(await hasRecipeDetails(supabase, id))) notFound();

  const [t, locale, user] = await Promise.all([getTranslations("adminContent.content.detail"), getLocale(), getUser()]);
  const [{ model, video }, categories] = await Promise.all([
    loadRecipeView(supabase, { contentId: id, title: content.title, premium: false, userId: user?.id, locale, poster: content.cover_url }),
    loadRecipeCategories(supabase, locale),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div role="note" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info/40 bg-info-soft px-4 py-3" data-testid="admin-recipe-preview-banner">
        <p className="flex items-center gap-2 type-body-sm font-medium text-fg">
          <Eye className="size-4 shrink-0" aria-hidden="true" />
          {t("previewBanner")}
        </p>
        <Button asChild variant="secondary" leadingIcon={<ArrowLeft />}>
          <Link href={`/admin/content/${id}`}>{t("backToDetail")}</Link>
        </Button>
      </div>
      <RecipeView
        contentId={id}
        viewerId={user?.id ?? null}
        syncUrl={false}
        model={model}
        video={video}
        unoptimizedImages={!isLive(content.status, content.publish_at)}
        categoryLabels={Object.fromEntries(categories.map((c) => [c.code, c.label]))}
        header={{ title: content.title, summary: content.summary, difficulty: content.difficulty, creator: content.creator }}
      />
    </div>
  );
}
