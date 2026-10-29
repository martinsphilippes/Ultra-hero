import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { BackLink } from "@/components/ui/back-link";
import { notFound, redirect } from "next/navigation";
import { RecipeGate } from "@/components/recipes/RecipeGate";
import { CookMode } from "@/components/recipes/kitchen/CookMode";
import { loadUnitLabels } from "@/components/recipes/view/RecipeView";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { getUser, requireUser } from "@/lib/auth/session";
import { buildCookModel, cookModeHref, recipeHref } from "@/lib/recipes/cook-mode";
import { getRecipeGate } from "@/lib/recipes/gate";
import { hasRecipeDetails, loadRecipeRows } from "@/lib/recipes/rows";
import { parseServingsParam } from "@/lib/recipes/scale";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const SLUG_RE = /^[a-z0-9-]{1,120}$/;

async function loadRecipe(slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("content").select("id, slug, title, type, source_locale").eq("slug", slug).maybeSingle();
  return data ?? null;
}

// O mesmo título da página da receita: a tradução publicada no idioma da tela, se houver.
async function localizedTitle(supabase: Awaited<ReturnType<typeof createClient>>, content: { id: string; title: string; source_locale: string }): Promise<string> {
  const locale = await getLocale();
  if (content.source_locale === locale) return content.title;
  const { data } = await supabase.from("content_localizations").select("title").eq("content_id", content.id).eq("locale", locale as Locale).eq("status", "published").maybeSingle();
  return data?.title ?? content.title;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations("kitchen.cook");
  // só o título público: o Modo Cozinha nunca entra em buscador
  const user = await getUser();
  const content = user ? await loadRecipe(slug) : null;
  return { title: content ? t("metaTitle", { title: content.title }) : t("eyebrow"), robots: { index: false, follow: false } };
}

// Modo Cozinha (/content/[slug]/cozinha): exige sessão, a etapa demonstrativa e o acesso à receita,
// como a página completa (o banco também bloqueia). Sem acesso volta à receita, que explica o motivo.
export default async function CookModePage({ params, searchParams }: Params) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  // mesma leitura de ?porcoes= da página da receita (1–50, o primeiro se vier repetido); a volta leva o mesmo valor
  const servings = parseServingsParam(query.porcoes);
  const path = cookModeHref(slug, servings === null ? null : String(servings));
  const user = await requireUser(path);
  const content = await loadRecipe(slug);
  if (!content) notFound();
  if (content.type !== "recipe") redirect(`/content/${content.slug}`);

  const gate = await getRecipeGate();
  if (!gate.completed) {
    const t = await getTranslations("kitchen.cook");
    return (
      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-gutter py-6 outline-none">
        <BackLink href={`/content/${content.slug}`}>{t("backToRecipe")}</BackLink>
        <h1 className="type-h1 text-balance text-fg">{content.title}</h1>
        <RecipeGate nextPath={path} />
      </main>
    );
  }

  const supabase = await createClient();
  const [access, structured] = await Promise.all([supabase.rpc("can_access_content", { p_content: content.id }), hasRecipeDetails(supabase, content.id)]);
  if (!access.data || !structured) redirect(`/content/${content.slug}`);

  const [rows, labels, locale, completion, title] = await Promise.all([
    // modo completo (sem publicOnly): etapas, vínculos e ingredientes; a RLS já conferiu o acesso acima
    loadRecipeRows(supabase, content.id),
    loadUnitLabels(),
    getLocale(),
    supabase.from("completions").select("completed_at").eq("user_id", user.id).eq("content_id", content.id).maybeSingle(),
    localizedTitle(supabase, content),
  ]);
  const t = await getTranslations("kitchen.cook");
  const model = buildCookModel(rows, { contentId: content.id, slug: content.slug, title, labels, locale, servings });
  const completedAt = completion.data?.completed_at ?? null;

  return (
    <CookMode
      model={model}
      userId={user.id}
      recipeHref={recipeHref(content.slug, servings)}
      completedLabel={completedAt ? t("complete.completedOn", { date: formatDate(completedAt, locale as Locale) }) : null}
    />
  );
}
