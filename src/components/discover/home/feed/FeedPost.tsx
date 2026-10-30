import { Ban, BookOpen, ChefHat, Dumbbell, FileText, ImageIcon, Lock, PlayCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CoverImage } from "@/components/catalog/CoverImage";
import { FollowButton } from "@/components/heroes/FollowButton";
import { Avatar } from "@/components/ui";
import { supabaseBaseUrl } from "@/lib/avatar/paths";
import { isPhotoPost } from "@/lib/post-photo/paths";
import type { FeedPostData } from "./posts";

const TYPE_ICON = { video: PlayCircle, recipe: ChefHat, workout: Dumbbell, guide: BookOpen, article: FileText } as const;

/** Estado do botão Seguir no cabeçalho do post; ausente = sem botão (banco sem hero_favorites). */
export type FeedFollow = { signedIn: boolean; following: ReadonlySet<string>; pushReady: boolean; path: string };

type Props = { post: FeedPostData; priority?: boolean; follow?: FeedFollow };

// Post do feed do Início, no formato do Instagram: herói no topo (leva ao perfil dele), capa grande
// 4:5 (de borda a borda no celular) e legenda com tipo, título e resumo. Capa e título abrem o post.
export async function FeedPost({ post, priority, follow }: Props) {
  const t = await getTranslations("catalog");
  // post com foto do composer (0043): artigo cuja capa é a foto; aparece como "Foto"
  const photo = isPhotoPost(post, supabaseBaseUrl());
  const Icon = photo ? ImageIcon : TYPE_ICON[post.type];
  const unavailable = post.access_level === null;
  const premium = post.access_level === "premium";
  const href = `/content/${post.slug}`;
  const titleId = `post-${post.id}`;
  const restriction = unavailable ? t("tile.unavailable") : premium ? t("tile.premium", { plan: post.required_module?.name ?? t("premium") }) : null;

  return (
    <article aria-labelledby={titleId} className="flex flex-col" data-testid="feed-post">
      {post.creator ? (
        // cabeçalho: herói (leva ao perfil) e, ao lado, Seguir — fora do link
        <div className="flex items-center justify-between gap-3 px-gutter md:px-0">
          <Link
            href={`/personalities/${post.creator.slug}`}
            className="flex min-h-14 min-w-0 items-center gap-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            data-testid="feed-post-hero"
          >
            <Avatar src={post.creator.avatar_url} name={post.creator.name} alt="" size="sm" />
            <span className="truncate text-sm font-semibold text-fg">{post.creator.name}</span>
          </Link>
          {follow && post.creator_id ? (
            <FollowButton
              creatorId={post.creator_id}
              heroName={post.creator.name}
              initialFollowing={follow.following.has(post.creator_id)}
              signedIn={follow.signedIn}
              path={follow.path}
              pushReady={follow.pushReady}
              size="compact"
            />
          ) : null}
        </div>
      ) : (
        <div className="min-h-3" />
      )}

      <Link
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className="uh-post-media group relative block aspect-[4/5] overflow-hidden bg-surface-elevated md:rounded-lg"
        data-testid="feed-post-cover"
      >
        <CoverImage src={post.cover_url} pillar={post.pillar} video={post.type === "video" && !photo} priority={priority} sizes="(min-width: 768px) 470px, 100vw" className="uh-post-image object-cover" />
        {/* véu da transição de entrada (feed-reveal em globals.css): escuro → imagem, ligado à rolagem */}
        <span aria-hidden="true" className="uh-post-veil pointer-events-none absolute inset-0 bg-black opacity-0" />
        {/* Ícones brancos com sombra: legíveis sobre qualquer capa sem escurecer a imagem. */}
        <Icon className="absolute right-3 top-3 size-6 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
        {unavailable ? (
          <Ban className="absolute bottom-3 left-3 size-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
        ) : premium ? (
          <Lock className="absolute bottom-3 left-3 size-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
        ) : null}
      </Link>

      <div className="uh-post-caption flex flex-col gap-1 px-gutter pt-3 md:px-0">
        <p className="uh-post-type type-caption text-fg-muted">{[photo ? t("photoPost") : t(`types.${post.type}`), restriction].filter(Boolean).join(" · ")}</p>
        <h2 id={titleId} className="uh-post-title text-base font-semibold leading-snug text-fg">
          {/* O link do título é o alvo de teclado e leitor de tela; a capa repete o destino só para o toque. */}
          <Link href={href} className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {post.title}
          </Link>
        </h2>
        {post.summary ? <p className="type-body-sm line-clamp-2 text-fg-muted">{post.summary}</p> : null}
      </div>
    </article>
  );
}
