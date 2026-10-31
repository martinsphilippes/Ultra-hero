import { Ban, BookOpen, ChefHat, Dumbbell, FileText, PlayCircle, Tag } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { tileLabel, type ContentTileData } from "@/components/discover/explore/tiles";
import { cn } from "@/lib/utils";
import { CoverImage } from "./CoverImage";

const TYPE_ICON = {
  video: PlayCircle,
  recipe: ChefHat,
  workout: Dumbbell,
  guide: BookOpen,
  article: FileText,
} as const;

type Props = {
  content: ContentTileData;
  /** Prioriza o carregamento da capa (primeiros quadros da dobra). */
  priority?: boolean;
  /** Há produtos marcados na foto (Smart Tags, 0062): ícone discreto no canto. */
  tagged?: boolean;
  className?: string;
};

// Quadro da grade do Explorar (estilo Instagram): só a capa, o ícone do tipo e o aviso quando
// indisponível. Título e herói ficam para a página do conteúdo; para leitores de tela vão no sr-only.
export async function ContentTile({ content, priority, tagged, className }: Props) {
  const t = await getTranslations("catalog");
  const Icon = TYPE_ICON[content.type];
  const unavailable = content.access_level === null;
  const restriction = unavailable ? t("tile.unavailable") : null;
  const label = tileLabel({ title: content.title, creator: content.creator?.name, type: t(`types.${content.type}`), restriction });

  return (
    <Link
      href={`/content/${content.slug}`}
      className={cn(
        "group relative block aspect-square overflow-hidden bg-surface-elevated",
        // O outline global vazaria sob os vizinhos (gap de 2px) e um ring no próprio link fica atrás da
        // <Image fill>; o indicador é o span abaixo, pintado depois da imagem.
        "focus-visible:outline-none",
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      {/* sem capa ou capa que falha: placeholder da marca (com play em vídeo), nunca um quadrado vazio */}
      <CoverImage
        src={content.cover_url}
        pillar={content.pillar}
        video={content.type === "video"}
        priority={priority}
        sizes="(min-width: 768px) 16rem, 33vw"
        className="object-cover transition-transform duration-500 ease-out-expo group-hover:scale-[1.04] motion-reduce:transition-none"
      />
      {/* Ícones brancos com sombra: legíveis sobre qualquer capa sem escurecer a imagem inteira. */}
      <Icon aria-hidden="true" className="absolute right-1.5 top-1.5 size-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
      {unavailable ? (
        <Ban aria-hidden="true" className="absolute bottom-1.5 left-1.5 size-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
      ) : null}
      {tagged ? (
        <span aria-hidden="true" className="absolute bottom-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm" data-testid="tile-smart-tags">
          <Tag className="size-3 text-white" />
        </span>
      ) : null}
      <span
        aria-hidden="true"
        data-focus-ring=""
        className="pointer-events-none absolute inset-0 opacity-0 ring-[3px] ring-inset ring-focus group-focus-visible:opacity-100"
      />
    </Link>
  );
}
