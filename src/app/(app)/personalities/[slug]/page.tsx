import type { Metadata } from "next";
import { Info, ShieldCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { BrandStrip } from "@/components/brands/BrandStrip";
import { ContentTile } from "@/components/catalog";
import { HeroCollectibleBanner } from "@/components/collectibles/HeroCollectibleBanner";
import { TILE_GRID } from "@/components/discover/grid";
import { InlineError } from "@/components/discover/InlineError";
import { HeroBio } from "@/components/discover/personalities/HeroBio";
import { HeroPageViewTracker } from "@/components/discover/personalities/HeroPageViewTracker";
import { LibraryHighlights } from "@/components/discover/personalities/LibraryHighlights";
import { FollowButton } from "@/components/heroes/FollowButton";
import { ChefHighlights } from "@/components/recipes/catalog/ChefHighlights";
import { AvatarInitials, Badge } from "@/components/ui";
import { AvatarImage } from "@/components/ui/avatar-image";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { hubHref, loadCreator, loadCreatorHub } from "@/lib/catalog/creator-hub";
import { effectiveRightsStatus, showsFictionalBadge } from "@/lib/catalog/rights";
import { getFollowContext } from "@/lib/heroes/follow-context";
import { loadFollowerCount } from "@/lib/heroes/follow-queries";
import { loadCreatorBrandChips, loadSmartTagsFor } from "@/lib/brands/queries";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [creator, t] = await Promise.all([loadCreator(slug), getTranslations("discover.meta")]);
  if (!creator) return {};
  return { title: t("personality", { name: creator.name }), description: creator.headline ?? undefined };
}

// Perfil do herói no formato do Instagram (RF-004): foto pequena, nome e números, bio em uma linha,
// atalhos (configurados pelo admin por categoria, 0050) como destaques e a grade de posts 3 por linha. A nota de direitos (fictício, em
// validação ou autorizado) fica discreta no fim. Cada biblioteca tem a sua própria página.
export default async function PersonalityPage({ params, searchParams }: Props) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);

  // As abas antigas viravam ?tab=…: Produtos e Programas viram bibliotecas; o resto volta ao hub.
  const tab = first(raw.tab);
  if (tab !== undefined) permanentRedirect(hubHref(slug, tab === "produtos" || tab === "programas" ? tab : undefined));

  const [creator, t, tl, locale] = await Promise.all([loadCreator(slug), getTranslations("discover.personalities.profile"), getTranslations("discover.personalities.libraries"), getLocale()]);
  if (!creator) notFound();

  // RB-05: só "autorizado" com titular documentado e dentro da validade tira o selo de fictício.
  const rights = effectiveRightsStatus(creator.rights_status, creator.rights_valid_until);
  const supabase = await createClient();
  const [hub, follow, followers, brands] = await Promise.all([
    loadCreatorHub(creator),
    getFollowContext(),
    loadFollowerCount(supabase, creator.id),
    // marcas do herói (0062); sem a 0062, nenhuma
    loadCreatorBrandChips(supabase, creator.id),
  ]);
  const hasError = hub.errors.contents || hub.errors.programs || hub.errors.products;

  // Grade de posts: só o que o herói publicou (as receitas que ele indica ficam em Alimentação).
  const posts = hub.contents.filter((c) => c.creator?.slug === creator.slug);
  // posts com produtos marcados na foto: ícone discreto no quadro (as marcações abrem no post)
  const tagged = await loadSmartTagsFor(supabase, posts);
  const statLabel = (key: "posts" | "programs" | "products", n: number) => t(`statLabels.${key}${n === 1 ? "One" : "Other"}`);
  const stats = [
    { key: "posts", value: posts.length, label: statLabel("posts", posts.length) },
    { key: "programs", value: hub.programs.length, label: statLabel("programs", hub.programs.length) },
    // no app das lojas não há comércio: a contagem de produtos também sai
    ...(hub.commerceEnabled && !follow.nativeApp ? [{ key: "products", value: hub.products.length, label: statLabel("products", hub.products.length) }] : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* visita à página do herói (0061): contador por dia, sem a pessoa */}
      <HeroPageViewTracker creatorId={creator.id} />
      <Link href="/personalities" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        ← {t("back")}
      </Link>

      {/* Cabeçalho no formato do Instagram: foto pequena, nome e números lado a lado; o que importa são os posts. */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-5">
          <span data-testid="hero-page-avatar" className="relative inline-flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-elevated text-2xl font-bold uppercase text-fg-muted sm:size-24 sm:text-3xl">
            {/* só foto real (enviada pelo herói, 0031, ou a oficial); sem foto ou se não carrega: as iniciais */}
            <AvatarImage src={creator.avatar_url} alt="" fallback={<AvatarInitials name={creator.name} />} fill priority sizes="96px" className="object-cover" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="truncate text-xl font-semibold text-fg">{creator.name}</h1>
              {showsFictionalBadge(rights) && <Badge variant="demo" size="sm">{t("fictional")}</Badge>}
              {rights === "pending" && <Badge variant="info" size="sm">{t("rightsPendingBadge")}</Badge>}
            </div>
            <ul className="flex gap-5" aria-label={t("statsLabel")} data-testid="hero-stats">
              {stats.map((stat) => (
                <li key={stat.key} className="flex flex-col leading-tight">
                  <span className="text-base font-semibold text-fg type-numeric">{stat.value}</span>
                  <span className="text-xs text-fg-muted">{stat.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {/* Marcas do herói (0062): logos em chips com o tipo de relação; rolagem lateral quando são muitas */}
        <BrandStrip brands={brands} heroName={creator.name} />
        {/* Seguir (hero_favorites, 0054) com a contagem pública de seguidores (0056) */}
        {follow.available ? (
          <div data-testid="hero-follow">
            <FollowButton
              creatorId={creator.id}
              heroName={creator.name}
              initialFollowing={follow.following.has(creator.id)}
              signedIn={follow.signedIn}
              path={`/personalities/${creator.slug}`}
              followers={followers}
              pushReady={follow.pushReady}
            />
          </div>
        ) : null}
        <HeroBio headline={creator.headline} bio={creator.bio} />
        {/* perfil do chef: especialidades e credenciais aprovadas pelo admin (P7) */}
        <ChefHighlights creatorId={creator.id} />
        {/* Colecionáveis do herói ao vivo/agendados (0057); sem item, nada */}
        <HeroCollectibleBanner creatorId={creator.id} />
      </header>

      <section aria-labelledby="hero-libraries-title" className="flex flex-col gap-2">
        <h2 id="hero-libraries-title" className="sr-only">
          {tl("title", { name: creator.name })}
        </h2>
        {hasError ? <InlineError /> : null}
        {hub.tiles.length > 0 ? <LibraryHighlights slug={creator.slug} tiles={hub.tiles} /> : null}
      </section>

      <section aria-labelledby="hero-posts-title" className="flex flex-col gap-2">
        <h2 id="hero-posts-title" className="sr-only">
          {t("postsTitle")}
        </h2>
        {posts.length > 0 ? (
          <div className={TILE_GRID} data-testid="hero-posts">
            {posts.map((post, index) => (
              <ContentTile key={post.id} content={post} priority={index < 3} tagged={tagged.has(post.id)} />
            ))}
          </div>
        ) : hasError ? null : (
          <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center type-body-sm text-fg-muted">{t("postsEmpty")}</p>
        )}
      </section>

      {/* Nota de direitos (RB-05): fictício ou em validação nunca aparecem como autorizado;
          autorizado exibe o titular e a validade registrados pela administração. */}
      <aside
        aria-label={t("rightsTitle")}
        className={cn(
          "flex gap-3 rounded-xl border border-dashed p-3",
          rights === "authorized" ? "border-success/40 bg-success-soft/40" : "border-warning/40 bg-warning-soft/40",
        )}
      >
        {rights === "authorized" ? (
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        )}
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold text-fg">{t("rightsTitle")}</p>
          {rights === "authorized" ? (
            <p className="type-body-sm text-fg-muted">
              {t("rightsAuthorized", { holder: creator.rights_holder ?? "" })}
              {creator.rights_valid_until ? ` ${t("rightsValidUntil", { date: formatPlainDate(creator.rights_valid_until, locale as Locale) })}` : ""}
            </p>
          ) : (
            <p className="type-body-sm text-fg-muted">
              {creator.rights_note?.trim() || t("rightsDefault")}
              {rights === "pending" ? ` ${t("rightsPending")}` : ""}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

