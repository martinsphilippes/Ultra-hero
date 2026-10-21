import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge, Card, CardImage, PillarBadge } from "@/components/ui";
import type { CreatorCardData } from "@/lib/catalog/queries";
import { effectiveRightsStatus, showsFictionalBadge } from "@/lib/catalog/rights";
import { cn } from "@/lib/utils";

type Props = { creator: CreatorCardData; priority?: boolean; className?: string };

// Card de personalidade. O selo de fictício só sai com uso de nome e imagem autorizado e válido (RB-05).
export async function CreatorCard({ creator, priority, className }: Props) {
  const t = await getTranslations("catalog");
  const fictional = showsFictionalBadge(effectiveRightsStatus(creator.rights_status, creator.rights_valid_until));
  return (
    <Card interactive asChild className={cn("h-full", className)}>
      <Link href={`/personalities/${creator.slug}`}>
        <CardImage src={creator.cover_url ?? "/placeholders/cover-routine-2.svg"} alt="" ratio="wide" priority={priority} />
        {/* Foto grande, como num perfil de rede social: ocupa boa parte da largura do card no celular. */}
        <div className="relative -mt-16 flex flex-1 flex-col gap-2 px-4 pb-4 sm:-mt-12">
          <span className="relative inline-flex size-32 overflow-hidden rounded-full border-4 border-surface bg-surface-elevated shadow-sm sm:size-24">
            <Image src={creator.avatar_url ?? "/placeholders/avatar-1.svg"} alt="" fill unoptimized sizes="128px" className="object-cover" />
          </span>
          <div>
            <h3 className="type-h3 text-fg">{creator.name}</h3>
            {creator.headline ? <p className="type-body-sm text-fg-muted">{creator.headline}</p> : null}
          </div>
          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {creator.pillars.map((p) => (
              <PillarBadge key={p} pillar={p} size="sm" />
            ))}
            {fictional ? <Badge variant="demo" size="sm">{t("fictional")}</Badge> : null}
          </div>
        </div>
      </Link>
    </Card>
  );
}
