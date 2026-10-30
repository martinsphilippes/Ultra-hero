import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { HeroCoverImage } from "@/components/creator/HeroCoverImage";
import { AvatarInitials, Badge, Card } from "@/components/ui";
import { AvatarImage } from "@/components/ui/avatar-image";
import type { CreatorCardData } from "@/lib/catalog/queries";
import { effectiveRightsStatus, showsFictionalBadge } from "@/lib/catalog/rights";
import { cn } from "@/lib/utils";

type Props = {
  creator: CreatorCardData;
  /** Rótulos das categorias do herói (até 2, já traduzidos e na ordem); vazio = sem selo. */
  categories?: readonly { id: string; label: string }[];
  priority?: boolean;
  className?: string;
};

// Card de personalidade. O selo de fictício só sai com uso de nome e imagem autorizado e válido (RB-05).
// Selos: as categorias do herói (0049), não os pilares.
// Só fotos reais: sem capa, uma superfície lisa do tema; sem foto, as iniciais do nome.
export async function CreatorCard({ creator, categories = [], priority, className }: Props) {
  const t = await getTranslations("catalog");
  const fictional = showsFictionalBadge(effectiveRightsStatus(creator.rights_status, creator.rights_valid_until));
  return (
    <Card interactive asChild className={cn("h-full", className)}>
      <Link href={`/personalities/${creator.slug}`}>
        <HeroCoverImage src={creator.cover_url} ratio="wide" priority={priority} card />
        {/* Foto grande, como num perfil de rede social: ocupa boa parte da largura do card no celular. */}
        <div className="relative -mt-16 flex flex-1 flex-col gap-2 px-4 pb-4 sm:-mt-12">
          <span className="relative inline-flex size-32 items-center justify-center overflow-hidden rounded-full border-4 border-surface bg-surface-elevated text-4xl font-bold uppercase text-fg-muted shadow-sm sm:size-24 sm:text-3xl">
            <AvatarImage src={creator.avatar_url} alt="" fallback={<AvatarInitials name={creator.name} />} fill sizes="128px" className="object-cover" />
          </span>
          <div>
            <h3 className="type-h3 text-fg">{creator.name}</h3>
            {creator.headline ? <p className="type-body-sm text-fg-muted">{creator.headline}</p> : null}
          </div>
          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {categories.map((c) => (
              <Badge key={c.id} size="sm" data-testid="hero-category-badge">
                {c.label}
              </Badge>
            ))}
            {fictional ? <Badge variant="demo" size="sm">{t("fictional")}</Badge> : null}
          </div>
        </div>
      </Link>
    </Card>
  );
}
