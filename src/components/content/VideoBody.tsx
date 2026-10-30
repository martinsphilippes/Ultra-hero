import { Sparkles, VideoOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DemoPlayer, VideoEmbed } from "@/components/player";
import { EmptyState } from "@/components/ui";
import type { ResolvedVideo } from "@/lib/video/types";
import type { VideoBodyMeta } from "./body-types";

type Props = {
  contentId: string;
  title: string;
  source: ResolvedVideo;
  meta: VideoBodyMeta;
  hasCaptions: boolean;
  poster: string | null;
  initialPositionSec: number;
  alreadyCompleted: boolean;
  threshold: number;
  path: string;
  /** "player": só o player (vai no topo da página, no lugar da capa); "details": só introdução e pontos-chave. */
  part?: "all" | "player" | "details";
};

/** Fontes que tocam de verdade (player simulado ou embed): só essas tomam o lugar da capa. */
export function isPlayableVideo(source: ResolvedVideo): boolean {
  return source.type === "demo" || source.type === "iframe";
}

// Vídeo: escolhe entre player simulado (sem mídia), iframe de embed ou estado indisponível.
export async function VideoBody({ contentId, title, source, meta, hasCaptions, poster, initialPositionSec, alreadyCompleted, threshold, path, part = "all" }: Props) {
  const t = await getTranslations("consume.body.video");
  const showPlayer = part !== "details";
  const showDetails = part !== "player";
  return (
    <div className="flex flex-col gap-8">
      {!showPlayer ? null : source.type === "demo" ? (
        <DemoPlayer
          contentId={contentId}
          title={title}
          durationSec={source.durationSec}
          transcript={source.transcript}
          poster={source.poster ?? poster}
          initialPositionSec={initialPositionSec}
          alreadyCompleted={alreadyCompleted}
          threshold={threshold}
          path={path}
        />
      ) : source.type === "iframe" ? (
        <div className="flex flex-col gap-2">
          <VideoEmbed src={source.url} title={title} hasCaptions={hasCaptions} autoPlay />
          {!alreadyCompleted && <p className="type-caption text-fg-muted">{t("manualCompleteHint")}</p>}
        </div>
      ) : source.type === "hls" ? (
        // HLS ainda não tem player no POC (provedores pagos são stubs): estado explícito.
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState size="sm" icon={<VideoOff />} title={t("noMedia")} description={t("providerNotConfigured")} />
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            size="sm"
            icon={<VideoOff />}
            title={t("noMedia")}
            description={source.reason === "missing-keys" ? t("providerNotConfigured") : t("noMediaDescription")}
          />
        </div>
      )}

      {showDetails && meta.intro && (
        <section className="flex flex-col gap-2">
          <h2 className="type-h3 text-fg">{t("intro")}</h2>
          <p className="type-body max-w-prose text-fg-muted">{meta.intro}</p>
        </section>
      )}
      {showDetails && meta.keyPoints.length > 0 && (
        <section aria-labelledby="video-key-points" className="rounded-2xl border border-accent/30 bg-accent-soft/40 p-5">
          <h2 id="video-key-points" className="mb-3 flex items-center gap-2 type-h3 text-fg">
            <Sparkles className="size-5 text-accent-text" aria-hidden="true" />
            {t("keyPoints")}
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 type-body text-fg">
            {meta.keyPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
