import { Captions } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { withAutoplay } from "@/lib/video/autoplay";

type Props = {
  /** URL já validada pelo provedor (youtube-nocookie / player.vimeo). */
  src: string;
  title: string;
  hasCaptions?: boolean;
  /** Começa sozinho (mudo). Ligado na página do vídeo; a receita não começa sozinha. */
  autoPlay?: boolean;
  className?: string;
};

// Iframe 16:9 (opcionalmente começa sozinho, mudo; o player oferece o som), título acessível e permissões mínimas.
export async function VideoEmbed({ src, title, hasCaptions = false, autoPlay = false, className }: Props) {
  const t = await getTranslations("consume.body.video");
  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-obsidian shadow-md">
        <iframe
          src={autoPlay ? withAutoplay(src) : src}
          loading={autoPlay ? undefined : "lazy"}
          title={t("embedTitle", { title })}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
          className="absolute inset-0 size-full border-0"
        />
      </div>
      {hasCaptions && (
        <figcaption className="flex items-center gap-1.5 type-caption text-fg-muted">
          <Captions className="size-4" aria-hidden="true" />
          {t("captionsNotice")}
        </figcaption>
      )}
    </figure>
  );
}
