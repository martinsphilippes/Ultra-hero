import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { BookOpen, ChefHat, Dumbbell, FileText, PlayCircle } from "lucide-react";
import { Badge, Card, CardImage, PillarBadge, PlanBadge } from "@/components/ui";
import type { ContentCardData } from "@/lib/catalog/queries";
import { cn } from "@/lib/utils";

const TYPE_ICON = {
  video: PlayCircle,
  recipe: ChefHat,
  workout: Dumbbell,
  guide: BookOpen,
  article: FileText,
} as const;

type Props = {
  content: ContentCardData;
  /** Prioriza o carregamento da imagem (primeiro card da dobra). */
  priority?: boolean;
  /** Progresso 0–100 para "continuar de onde parou". */
  progressPct?: number | null;
  className?: string;
};

// Card premium de conteúdo. Server Component: use dentro de listas em páginas server.
export async function ContentCard({ content, priority, progressPct, className }: Props) {
  const [t, locale] = await Promise.all([getTranslations("catalog"), getLocale()]);
  const Icon = TYPE_ICON[content.type];
  const unavailable = content.access_level === null;
  const premium = content.access_level === "premium";
  const foreign = content.source_locale !== locale;

  return (
    <Card interactive asChild className={cn("h-full", className)}>
      {/* nome acessível = texto visível do card (WCAG 2.5.3) */}
      <Link href={`/content/${content.slug}`}>
        <CardImage
          src={content.cover_url ?? "/placeholders/cover-routine-1.svg"}
          alt=""
          priority={priority}
          overlay={
            <>
              <div className="flex items-start justify-between gap-2">
                <PillarBadge pillar={content.pillar} size="sm" />
                {unavailable ? (
                  <Badge variant="neutral" size="sm">{t("unavailable")}</Badge>
                ) : premium ? (
                  <Badge variant="premium" size="sm" title={content.required_module?.name}>
                    {content.required_module?.name ?? t("premium")}
                  </Badge>
                ) : (
                  <PlanBadge plan="free" size="sm" />
                )}
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-white/90">
                <Icon className="size-4" aria-hidden="true" />
                <span>{t(`types.${content.type}`)}</span>
                {content.duration_minutes ? <span aria-label={t("durationLabel", { minutes: content.duration_minutes })}>· {t("minutes", { n: content.duration_minutes })}</span> : null}
                {foreign ? <Badge variant="neutral" size="sm" className="ml-auto bg-black/40 text-white border-white/30">{content.source_locale}</Badge> : null}
              </div>
            </>
          }
        />
        {typeof progressPct === "number" && progressPct > 0 ? (
          <div className="h-1 w-full bg-surface-hover" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={t("progress")}>
            <div className="h-full bg-accent" style={{ width: `${Math.min(100, progressPct)}%` }} />
          </div>
        ) : null}
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <h3 className="type-h3 line-clamp-2 text-fg">{content.title}</h3>
          {content.creator ? <p className="text-sm text-fg-muted">{t("by", { name: content.creator.name })}</p> : null}
          {content.summary ? <p className="type-body-sm line-clamp-2 text-fg-muted">{content.summary}</p> : null}
          {content.difficulty ? <p className="mt-auto pt-1 text-xs uppercase tracking-wider text-fg-muted">{t(`difficulty.${content.difficulty}`)}</p> : null}
        </div>
      </Link>
    </Card>
  );
}
