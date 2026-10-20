import { getTranslations } from "next-intl/server";
import { ContentCard } from "@/components/catalog";
import { Section } from "@/components/ui";
import { CONTENT_CARD_SELECT, type ContentCardData } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";
import type { Pillar } from "@/lib/supabase/helpers";
import { cn } from "@/lib/utils";
import { RAIL, RAIL_ITEM } from "../grid";
import { InlineError } from "../InlineError";
import { PILLAR_ICON, PILLAR_SOFT, PILLAR_TEXT } from "../pillars";

// Seção de um pilar: os 4 conteúdos publicados mais recentes, com a cor e o ícone do pilar.
export async function PillarSection({ pillar }: { pillar: Pillar }) {
  const [supabase, t, tp] = await Promise.all([createClient(), getTranslations("discover.home"), getTranslations("common.pillars")]);
  const { data, error } = await supabase
    .from("content")
    .select(CONTENT_CARD_SELECT)
    .eq("status", "published")
    .eq("pillar", pillar)
    .order("published_at", { ascending: false })
    .limit(4);

  if (error) return <InlineError />;
  const contents = (data ?? []) as unknown as ContentCardData[];
  if (contents.length === 0) return null;

  const Icon = PILLAR_ICON[pillar];
  return (
    <Section
      id={`pillar-${pillar}`}
      title={
        <span className="inline-flex items-center gap-2.5">
          <span aria-hidden="true" className={cn("inline-flex size-8 items-center justify-center rounded-lg border", PILLAR_SOFT[pillar])}>
            <Icon className={cn("size-4", PILLAR_TEXT[pillar])} />
          </span>
          {tp(pillar)}
        </span>
      }
      description={t(`pillars.${pillar}`)}
      href={`/explore?pillar=${pillar}`}
    >
      <div className={RAIL}>
        {contents.map((content) => (
          <ContentCard key={content.id} content={content} className={RAIL_ITEM} />
        ))}
      </div>
    </Section>
  );
}
