import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Layers } from "lucide-react";
import { Badge, Card, CardImage, PillarBadge } from "@/components/ui";
import type { ProgramCardData } from "@/lib/catalog/queries";
import { cn } from "@/lib/utils";

type Props = { program: ProgramCardData; priority?: boolean; className?: string; progressPct?: number | null };

// Card de programa (coleção navegável livremente, sem dias obrigatórios).
export async function ProgramCard({ program, priority, className, progressPct }: Props) {
  const t = await getTranslations("catalog");
  const title = program.version?.title ?? program.slug;
  return (
    <Card interactive asChild className={cn("h-full", className)}>
      <Link href={`/programs/${program.slug}`}>
        <CardImage
          src={program.cover_url ?? "/placeholders/cover-training-1.svg"}
          alt=""
          ratio="wide"
          priority={priority}
          overlay={
            <>
              <div className="flex items-start justify-between gap-2">
                <PillarBadge pillar={program.pillar} size="sm" />
                <Badge variant="accent" size="sm" icon={<Layers />}>{t("program")}</Badge>
              </div>
              {program.version?.estimated_weeks ? (
                <span className="text-xs font-medium text-white/90">{t("weeks", { n: program.version.estimated_weeks })}</span>
              ) : null}
            </>
          }
        />
        {typeof progressPct === "number" ? (
          <div className="h-1 w-full bg-surface-hover" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={t("progress")}>
            <div className="h-full bg-accent" style={{ width: `${Math.min(100, progressPct)}%` }} />
          </div>
        ) : null}
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <h3 className="type-h3 line-clamp-2 text-fg">{title}</h3>
          {program.creator ? <p className="text-sm text-fg-muted">{t("by", { name: program.creator.name })}</p> : null}
          {program.version?.summary ? <p className="type-body-sm line-clamp-2 text-fg-muted">{program.version.summary}</p> : null}
        </div>
      </Link>
    </Card>
  );
}
