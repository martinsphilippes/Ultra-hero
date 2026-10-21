import { Ban, BookOpen, ChefHat, Dumbbell, FileText, Lock, PlayCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { tileCover, tileLabel, type ContentTileData } from "@/components/discover/explore/tiles";
import { cn } from "@/lib/utils";

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
  className?: string;
};

// Quadro da grade do Explorar (estilo Instagram): só a capa, o ícone do tipo e o cadeado quando
// restrito. Título e herói ficam para a página do conteúdo; para leitores de tela vão no sr-only.
export async function ContentTile({ content, priority, className }: Props) {
  const t = await getTranslations("catalog");
  const Icon = TYPE_ICON[content.type];
  const unavailable = content.access_level === null;
  const premium = content.access_level === "premium";
  const src = tileCover(content.cover_url, content.pillar);
  const restriction = unavailable ? t("tile.unavailable") : premium ? t("tile.premium", { plan: content.required_module?.name ?? t("premium") }) : null;
  const label = tileLabel({ title: content.title, creator: content.creator?.name, type: t(`types.${content.type}`), restriction });

  return (
    <Link
      href={`/content/${content.slug}`}
      className={cn(
        "group relative block aspect-square overflow-hidden bg-surface-elevated",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <Image
        src={src}
        alt=""
        fill
        priority={priority}
        unoptimized={src.endsWith(".svg")}
        sizes="(min-width: 768px) 16rem, 33vw"
        className="object-cover transition-transform duration-500 ease-out-expo group-hover:scale-[1.04] motion-reduce:transition-none"
      />
      {/* Ícones brancos com sombra: legíveis sobre qualquer capa sem escurecer a imagem inteira. */}
      <Icon aria-hidden="true" className="absolute right-1.5 top-1.5 size-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
      {unavailable ? (
        <Ban aria-hidden="true" className="absolute bottom-1.5 left-1.5 size-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
      ) : premium ? (
        <Lock aria-hidden="true" className="absolute bottom-1.5 left-1.5 size-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
      ) : null}
    </Link>
  );
}
