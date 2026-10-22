import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { BookOpen, ChefHat, Clock, Copyright, Dumbbell, FileText, Play } from "lucide-react";
import { isScheduled } from "@/components/admin-content/lib/publish-at";
import { ContentCard } from "@/components/catalog";
import {
  DisclaimerBanner,
  displayTimeZone,
  GuideBody,
  LanguageNotice,
  LockCard,
  ReadingTracker,
  RelatedProducts,
  TeaserCard,
  UnavailableCard,
  VideoBody,
  ViewTracker,
  WorkoutBody,
  parseGuideBody,
  parseVideoBody,
  parseWorkoutBody,
  type DisclaimerKind,
} from "@/components/content";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import { recipeCategoryOptions } from "@/components/recipes/catalog/RecipeCatalog";
import { RecipeGate } from "@/components/recipes/RecipeGate";
import { RecipeKitchenEntry } from "@/components/recipes/kitchen/RecipeKitchenEntry";
import { CookModeLink, CookModeLinkView } from "@/components/recipes/view/CookModeLink";
import { RecipeGallery } from "@/components/recipes/view/RecipeGallery";
import { RecipeRating } from "@/components/recipes/view/RecipeRating";
import { RecipeShareButtons } from "@/components/recipes/view/RecipeShareButtons";
import { RecipeView } from "@/components/recipes/view/RecipeView";
import { RelatedRecipes } from "@/components/recipes/view/RelatedRecipes";
import { loadRecipeView } from "@/components/recipes/view/load-recipe-view";
import { loadRecipeLd, loadRatingState } from "@/components/recipes/view/recipe-page-data";
import { AddToListButton, CompleteButton, FavoriteButton, NotInterestedButton } from "@/components/library";
import { Avatar, Badge, PillarBadge, PlanBadge, Section } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { getProfile, getUser } from "@/lib/auth/session";
import { loadLocalizedBody } from "@/lib/catalog/localized-body";
import { CONTENT_CARD_SELECT, liveContentFilter, type ContentCardData } from "@/lib/catalog/queries";
import { cookModeHref } from "@/lib/recipes/cook-mode";
import { getRecipeGate } from "@/lib/recipes/gate";
import { isLive, isRecipeMediaUrl } from "@/lib/recipes/media";
import { recipesSeoIndexEnabled } from "@/lib/recipes/jsonld";
import { hasRecipeDetails } from "@/lib/recipes/rows";
import { parseServingsParam } from "@/lib/recipes/scale";
import { createClient } from "@/lib/supabase/server";
import type { AccessLevel, ContentType, LocaleCode, Pillar } from "@/lib/supabase/helpers";
import { resolveVideoSource } from "@/lib/video";

// Página de conteúdo: metadados públicos + corpo sob RLS. O estado (visitante, bloqueado,
// indisponível, acessível) é derivado do que o servidor devolve — nunca inferido no cliente.

// Licença: só o tipo e o crédito são públicos; media_license_ref é interna e nunca é selecionada aqui.
const CONTENT_DETAIL_SELECT =
  "id, slug, title, summary, cover_url, pillar, type, duration_minutes, difficulty, tags, has_captions, status, access_level, completion_mode, disclaimer_kind, source_locale, published_at, publish_at, creator_id, " +
  "media_license_kind, media_credit, required_module:plan_modules(id, code, name), creator:creator_profiles(id, slug, name, headline, avatar_url, is_fictional)";

type ContentDetail = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  cover_url: string | null;
  pillar: Pillar;
  type: ContentType;
  duration_minutes: number | null;
  difficulty: "beginner" | "intermediate" | "advanced" | null;
  tags: string[];
  has_captions: boolean;
  status: "draft" | "published" | "archived";
  access_level: AccessLevel | null;
  completion_mode: "manual" | "auto" | null;
  disclaimer_kind: DisclaimerKind;
  source_locale: LocaleCode;
  published_at: string | null;
  publish_at: string | null;
  creator_id: string | null;
  media_license_kind: "platform_demo" | "own" | "licensed" | "third_party_embed";
  media_credit: string | null;
  required_module: { id: string; code: string; name: string } | null;
  creator: { id: string; slug: string; name: string; headline: string | null; avatar_url: string | null; is_fictional: boolean } | null;
};

const TYPE_ICON = { video: Play, recipe: ChefHat, workout: Dumbbell, guide: BookOpen, article: FileText } as const;

type Params = { params: Promise<{ slug: string }> };
type PageProps = Params & { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Memoizado por request: generateMetadata e a página compartilham a mesma consulta.
const loadContent = cache(async (slug: string): Promise<ContentDetail | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("content").select(CONTENT_DETAIL_SELECT).eq("slug", slug).maybeSingle();
  return (data as unknown as ContentDetail | null) ?? null;
});

// SEO (fase 3): endereço canônico sem parâmetros (?porcoes= não vira outra página), Open Graph com a
// capa e cartão grande. Placeholder SVG não serve de prévia social e fica de fora.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const content = await loadContent(slug);
  if (!content) return {};
  const path = `/content/${content.slug}`;
  const image = content.cover_url && !content.cover_url.endsWith(".svg") ? content.cover_url : null;
  const description = content.summary ?? undefined;
  return {
    title: content.title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      url: path,
      title: content.title,
      description,
      siteName: "Ultra Hero",
      ...(image ? { images: [{ url: image, alt: content.title }] } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary", title: content.title, description, ...(image ? { images: [image] } : {}) },
  };
}

export default async function ContentPage({ params, searchParams }: PageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [content, user, locale, t, tc, tcat] = await Promise.all([
    loadContent(slug),
    getUser(),
    getLocale(),
    getTranslations("consume.content"),
    getTranslations("common"),
    getTranslations("catalog"),
  ]);
  if (!content) notFound();

  const supabase = await createClient();
  const path = `/content/${content.slug}`;
  const uiLocale = locale as Locale;
  const wantsLocalization = content.source_locale !== uiLocale;

  const [bodyRes, accessRes, locRes, locBody, settingsRes, completionRes, progressRes, favRes, niRes, moreRes, profile] = await Promise.all([
    user ? supabase.from("content_bodies").select("body, media_provider, media_ref, captions_url").eq("content_id", content.id).maybeSingle() : null,
    // Regra única de acesso (plano simulado, status, regra ausente) avaliada no servidor.
    user ? supabase.rpc("can_access_content", { p_content: content.id }) : null,
    wantsLocalization
      ? supabase.from("content_localizations").select("title, summary").eq("content_id", content.id).eq("locale", uiLocale).eq("status", "published").maybeSingle()
      : null,
    // corpo traduzido só para quem pode consumir (RPC da 0027; o visitante nunca recebe corpo)
    wantsLocalization && user ? loadLocalizedBody(supabase, content.id, uiLocale) : null,
    supabase.from("content_type_settings").select("default_completion_mode, auto_threshold_pct").eq("type", content.type).maybeSingle(),
    user ? supabase.from("completions").select("completed_at").eq("user_id", user.id).eq("content_id", content.id).maybeSingle() : null,
    user ? supabase.from("content_progress").select("position_seconds, progress_pct").eq("user_id", user.id).eq("content_id", content.id).maybeSingle() : null,
    user ? supabase.from("favorites").select("content_id").eq("user_id", user.id).eq("content_id", content.id).maybeSingle() : null,
    user ? supabase.from("not_interested").select("content_id").eq("user_id", user.id).eq("content_id", content.id).maybeSingle() : null,
    // receitas usam "Parecidas" (RelatedRecipes); "Mais de {herói}" é só dos outros tipos
    content.creator_id && content.type !== "recipe"
      ? supabase.from("content").select(CONTENT_CARD_SELECT).eq("creator_id", content.creator_id).eq("status", "published").or(liveContentFilter()).neq("id", content.id).order("published_at", { ascending: false }).limit(3)
      : null,
    user ? getProfile() : null,
  ]);

  // Tradução publicada para o idioma da UI (quando existe) sobrepõe título/resumo/corpo.
  const localization = locRes?.data ?? null;
  const title = localization?.title ?? content.title;
  const summary = localization?.summary ?? content.summary;
  const bodyRow = bodyRes?.data ?? null;
  // o corpo traduzido só vale junto da tradução publicada (a RPC também devolve rascunho ao admin)
  const body: unknown = (localization ? locBody : null) ?? bodyRow?.body ?? null;
  const showLanguageNotice = wantsLocalization && !localization;

  const mode: "manual" | "auto" = content.completion_mode ?? settingsRes.data?.default_completion_mode ?? "manual";
  const threshold = settingsRes.data?.auto_threshold_pct ?? 90;
  const completedAt = completionRes?.data?.completed_at ?? null;
  const completedLabel = completedAt ? t("completedOn", { date: formatDate(completedAt, uiLocale, undefined, displayTimeZone(profile?.timezone)) }) : null;
  const progressPct = progressRes?.data?.progress_pct ?? 0;
  const positionSec = progressRes?.data?.position_seconds ?? 0;
  const isFavorite = Boolean(favRes?.data);
  const notInterested = Boolean(niRes?.data);
  const more = ((moreRes?.data ?? []) as unknown as ContentCardData[]).filter((c) => c.id !== content.id);

  // visitante → teaser; sem direito ao módulo premium → bloqueado; sem regra de acesso
  // (access_level null) ou sem corpo → indisponível. Nunca inferimos plano no cliente.
  type State = "visitor" | "accessible" | "locked" | "unavailable";
  const canAccess = Boolean(accessRes?.data);
  const state: State = !user
    ? "visitor"
    : canAccess && bodyRow
      ? "accessible"
      : !canAccess && content.access_level === "premium"
        ? "locked"
        : "unavailable";

  // Vídeo: resolve o provedor no servidor (chaves nunca chegam ao cliente).
  const video =
    state === "accessible" && content.type === "video" && bodyRow
      ? await resolveVideoSource({
          mediaProvider: bodyRow.media_provider,
          mediaRef: bodyRow.media_ref,
          body,
          durationMinutes: content.duration_minutes,
          premium: content.access_level === "premium",
          poster: content.cover_url,
          userId: user?.id,
          locale: uiLocale,
        })
      : null;
  const allowManual = content.type === "video" && video?.type === "iframe";
  const readingAuto = (content.type === "guide" || content.type === "article") && mode === "auto";

  // Receita só abre depois da etapa demonstrativa (vale para todos, inclusive quem tem acesso ao módulo).
  const isRecipe = content.type === "recipe";
  const recipeGate = isRecipe ? await getRecipeGate() : null;
  const recipeBlocked = Boolean(recipeGate && !recipeGate.completed);
  const recipeOpen = isRecipe && state === "accessible" && !recipeBlocked;
  // Toda receita é estruturada desde a 0029 (o ramo do corpo v1 saiu na fase 3). Fechada, mostra só a
  // parte pública (a mesma do card: fotos, história, tempos, porções, alérgenos e dietas declarados)
  // e o bloqueio no lugar de ingredientes e preparo (P2). Sem recipe_details: indisponível.
  const live = isLive(content.status, content.publish_at);
  const structured =
    isRecipe && (await hasRecipeDetails(supabase, content.id))
      ? await loadRecipeView(supabase, {
          contentId: content.id,
          title,
          premium: content.access_level === "premium",
          userId: user?.id,
          locale: uiLocale,
          poster: content.cover_url,
          publicOnly: !recipeOpen,
        })
      : null;
  const servingsParam = parseServingsParam(query.porcoes);
  const [rating, categories] =
    recipeOpen && structured
      ? await Promise.all([loadRatingState(supabase, { contentId: content.id, creatorId: content.creator_id, userId: user?.id ?? null, completed: Boolean(completedAt) }), recipeCategoryOptions()])
      : [null, null];
  // JSON-LD só com RECIPES_SEO_INDEX (P6); ingredientes e preparo só para quem abre a receita
  const recipeJsonLd =
    isRecipe && structured && live && recipesSeoIndexEnabled()
      ? await loadRecipeLd({
          path,
          title,
          summary,
          cover: content.cover_url,
          publishedAt: content.published_at,
          tags: content.tags,
          chef: content.creator,
          model: structured.model,
          open: recipeOpen,
          categoryLabels: categories,
        })
      : null;
  const recipeLocked = recipeOpen ? null : recipeBlocked ? (
    <RecipeGate nextPath={path} />
  ) : state === "visitor" ? (
    <TeaserCard nextPath={path} />
  ) : state === "locked" ? (
    <LockCard moduleName={content.required_module?.name ?? tcat("premium")} />
  ) : (
    <UnavailableCard />
  );

  const TypeIcon = TYPE_ICON[content.type];
  const cover = content.cover_url ?? `/placeholders/cover-${content.pillar}-1.svg`;

  return (
    <div className="flex flex-col gap-8">
      <ViewTracker kind="content" id={content.id} extra={{ type: content.type, pillar: content.pillar, state }} />

      {/* Cabeçalho com capa */}
      <header className="flex flex-col gap-5">
        <Link
          href={isRecipe ? "/explore?tab=receitas" : "/explore"}
          className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus print:hidden"
        >
          ← {t("backToExplore")}
        </Link>
        {structured && structured.model.photos.length > 0 ? (
          <div className="print:hidden">
            <RecipeGallery photos={structured.model.photos} unoptimized={!live} />
          </div>
        ) : (
        <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl border border-border bg-surface-elevated sm:aspect-[3/1] print:hidden">
          {/* foto de receita fora do ar: o otimizador busca sem a sessão e não a veria */}
          <Image src={cover} alt="" fill priority unoptimized={cover.endsWith(".svg") || (isRecipeMediaUrl(cover) && !live)} sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-obsidian/70 via-transparent to-transparent" />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            <PillarBadge pillar={content.pillar} />
            {content.access_level === null ? (
              <Badge variant="neutral">{tcat("unavailable")}</Badge>
            ) : content.access_level === "premium" ? (
              <Badge variant="premium">{content.required_module?.name ?? tcat("premium")}</Badge>
            ) : (
              <PlanBadge plan="free" />
            )}
          </div>
        </div>
        )}

        <div className="flex flex-col gap-3">
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-fg-muted" aria-label={t("summaryLabel")}>
            <li className="inline-flex items-center gap-1.5">
              <TypeIcon className="size-4" aria-hidden="true" />
              {tcat(`types.${content.type}`)}
            </li>
            {content.duration_minutes ? (
              <li className="inline-flex items-center gap-1.5">
                <Clock className="size-4" aria-hidden="true" />
                {t("metaDuration", { n: content.duration_minutes })}
              </li>
            ) : null}
            {content.difficulty ? <li>{t("metaDifficulty", { level: tcat(`difficulty.${content.difficulty}`) })}</li> : null}
            {content.status !== "published" ? (
              <li>
                <Badge variant="warning" size="sm">{content.status}</Badge>
              </li>
            ) : null}
            {/* Só admin e a própria personalidade chegam a um conteúdo agendado (RLS). */}
            {isScheduled(content.status, content.publish_at) ? (
              <li>
                <Badge variant="info" size="sm">{t("scheduledBadge")}</Badge>
              </li>
            ) : null}
          </ul>
          <h1 className="type-h1 text-balance text-fg">{title}</h1>
          {summary && <p className="type-body max-w-prose text-fg-muted">{summary}</p>}

          {content.creator && (
            <Link
              href={`/personalities/${content.creator.slug}`}
              className="flex w-fit min-h-11 items-center gap-3 rounded-xl pr-2 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <Avatar src={content.creator.avatar_url} name={content.creator.name} alt="" size="md" />
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-fg">{tcat("by", { name: content.creator.name })}</span>
                <span className="flex items-center gap-2 type-caption text-fg-muted">
                  {content.creator.headline}
                  {content.creator.is_fictional && (
                    <Badge variant="demo" size="sm">
                      {t("creatorFictional")}
                    </Badge>
                  )}
                </span>
              </span>
            </Link>
          )}

          {(user || isRecipe) && (
            <div className="flex flex-wrap items-center gap-2 pt-1 print:hidden" role="group" aria-label={t("actionsLabel")}>
              {user ? (
                <>
                  <FavoriteButton contentId={content.id} initial={isFavorite} path={path} />
                  <AddToListButton contentId={content.id} />
                  <NotInterestedButton contentId={content.id} initial={notInterested} />
                </>
              ) : null}
              {isRecipe ? <RecipeShareButtons title={title} path={path} canPrint={Boolean(recipeOpen && structured)} /> : null}
              {recipeOpen && structured ? (
                <Suspense fallback={<CookModeLinkView href={cookModeHref(content.slug, null)} />}>
                  <CookModeLink slug={content.slug} />
                </Suspense>
              ) : null}
              {user && state === "accessible" && !recipeBlocked && (
                <CompleteButton
                  contentId={content.id}
                  mode={mode}
                  allowManual={allowManual}
                  threshold={threshold}
                  completedLabel={completedLabel}
                  progressPct={progressPct}
                  path={path}
                  className="ml-auto"
                />
              )}
            </div>
          )}
        </div>
      </header>

      {showLanguageNotice && <LanguageNotice sourceLocale={content.source_locale} />}
      <DisclaimerBanner kind={content.disclaimer_kind} />

      {recipeJsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: recipeJsonLd }} /> : null}

      {/* Histórico de receitas vistas (fase 4): só grava quando a pessoa abre a receita e ligou o histórico */}
      {recipeOpen && structured ? <RecipeKitchenEntry contentId={content.id} /> : null}

      {/* Receita: a parte pública sempre; ingredientes e preparo só com a etapa e o acesso (P2) */}
      {isRecipe &&
        (structured ? (
          <RecipeView
            contentId={content.id}
            viewerId={user?.id ?? null}
            model={structured.model}
            video={structured.video}
            unoptimizedImages={!live}
            showGallery={false}
            mode={recipeOpen ? "full" : "public"}
            gate={recipeLocked}
            initialServings={servingsParam}
            markedAllergies={recipeGate?.allergies ?? []}
            path={path}
            categoryLabels={categories ? Object.fromEntries(categories.map((c) => [c.code, c.label])) : undefined}
            footer={rating?.canRate ? <RecipeRating contentId={content.id} path={path} initial={rating.stars} /> : null}
          />
        ) : (
          (recipeLocked ?? <UnavailableCard />)
        ))}

      {/* Corpo por estado de acesso (demais tipos) */}
      {!isRecipe && state === "visitor" && <TeaserCard nextPath={path} />}
      {!isRecipe && state === "locked" && <LockCard moduleName={content.required_module?.name ?? tcat("premium")} />}
      {!isRecipe && state === "unavailable" && <UnavailableCard />}
      {!isRecipe && state === "accessible" && (
        <div className="flex flex-col gap-6">
          {readingAuto && !completedAt && <ReadingTracker contentId={content.id} targetId="content-body" threshold={threshold} path={path} />}
          {content.type === "video" && video && (
            <VideoBody
              contentId={content.id}
              title={title}
              source={video}
              meta={parseVideoBody(body)}
              hasCaptions={content.has_captions}
              poster={content.cover_url}
              initialPositionSec={positionSec}
              alreadyCompleted={Boolean(completedAt)}
              threshold={threshold}
              path={path}
            />
          )}
          {content.type === "workout" && <WorkoutBody workout={parseWorkoutBody(body)} />}
          {(content.type === "guide" || content.type === "article") && <GuideBody guide={parseGuideBody(body)} id="content-body" />}
        </div>
      )}

      {/* Crédito/licença da mídia (RF-008, RB-06): discreto, sempre visível; a referência interna nunca sai daqui. */}
      <p className="flex items-start gap-2 type-caption text-fg-muted">
        <Copyright className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {t("licenseLabel")}: {t(`license.${content.media_license_kind}`)}
          {content.media_credit ? ` · ${content.media_credit}` : ""}
        </span>
      </p>

      {content.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 print:hidden" aria-label={t("tags")}>
          {content.tags.map((tag) => (
            <li key={tag}>
              <Badge variant="neutral">#{tag}</Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="print:hidden">
        <RelatedProducts contentId={content.id} />
      </div>

      {isRecipe && structured ? (
        <RelatedRecipes contentId={content.id} chef={content.creator ? { id: content.creator.id, slug: content.creator.slug, name: content.creator.name } : null} categories={structured.model.categories} />
      ) : null}

      {!isRecipe && content.creator && more.length > 0 && (
        <Section id="more-from-creator" title={t("moreFromCreator", { name: content.creator.name })} href={`/personalities/${content.creator.slug}`} seeAllLabel={tc("actions.seeAll")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {more.map((item) => (
              <ContentCard key={item.id} content={item} />
            ))}
          </div>
        </Section>
      )}

      <section aria-label={t("feedbackTitle")} className="pt-2 print:hidden">
        <FeedbackWidget context={`content:${content.id}`} />
      </section>
    </div>
  );
}
