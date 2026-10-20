import { getTranslations } from "next-intl/server";
import { ContentCard, ProgramCard } from "@/components/catalog";
import { Section } from "@/components/ui";
import { CONTENT_CARD_SELECT, PROGRAM_CARD_SELECT, liveContentFilter, type ContentCardData, type ProgramCardData } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";
import { CARD_GRID, SCROLL_CARD } from "../grid";
import { InlineError } from "../InlineError";

// Curadoria editorial: conteúdos e programas marcados como destaque pelo admin (ordem = featured_rank).
export async function FeaturedSection() {
  const [supabase, t] = await Promise.all([createClient(), getTranslations("discover.home.featured")]);
  const [contentRes, programRes] = await Promise.all([
    supabase
      .from("content")
      .select(CONTENT_CARD_SELECT)
      .eq("status", "published")
      .or(liveContentFilter())
      .eq("is_featured", true)
      .order("featured_rank", { ascending: true, nullsFirst: false })
      .order("published_at", { ascending: false })
      .limit(6),
    supabase
      .from("programs")
      .select(PROGRAM_CARD_SELECT)
      .eq("status", "published")
      .eq("is_featured", true)
      .order("featured_rank", { ascending: true, nullsFirst: false })
      .limit(4),
  ]);

  if (contentRes.error && programRes.error) return <InlineError />;
  const contents = (contentRes.data ?? []) as unknown as ContentCardData[];
  const programs = ((programRes.data ?? []) as unknown as ProgramCardData[]).filter((p) => p.version);
  if (contents.length === 0 && programs.length === 0) return null;

  return (
    <Section id="featured" title={t("title")} description={t("description")} href="/explore" className="gap-4">
      {contents.length > 0 && (
        <div className={CARD_GRID}>
          {contents.map((content, index) => (
            <ContentCard key={content.id} content={content} priority={index === 0} />
          ))}
        </div>
      )}
      {programs.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="type-overline text-fg-muted">{t("programs")}</h3>
          <div className="-mx-gutter flex gap-3 overflow-x-auto px-gutter pb-1 scrollbar-none snap-x snap-mandatory">
            {programs.map((program) => (
              <ProgramCard key={program.id} program={program} className={`${SCROLL_CARD} shrink-0 snap-start`} />
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}
