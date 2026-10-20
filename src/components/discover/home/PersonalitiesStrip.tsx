import { getTranslations } from "next-intl/server";
import { CreatorCard } from "@/components/catalog";
import { Section } from "@/components/ui";
import { CREATOR_CARD_SELECT, type CreatorCardData } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";
import { SCROLL_CARD } from "../grid";
import { InlineError } from "../InlineError";

// Faixa horizontal de personalidades ativas (sempre identificadas como fictícias no card).
export async function PersonalitiesStrip() {
  const [supabase, t] = await Promise.all([createClient(), getTranslations("discover.home.personalities")]);
  const { data, error } = await supabase.from("creator_profiles").select(CREATOR_CARD_SELECT).eq("status", "active").order("sort_order").limit(8);

  if (error) return <InlineError />;
  const creators = (data ?? []) as unknown as CreatorCardData[];
  if (creators.length === 0) return null;

  return (
    <Section id="personalities" title={t("title")} description={t("description")} href="/personalities" scroll>
      {creators.map((creator) => (
        <CreatorCard key={creator.id} creator={creator} className={SCROLL_CARD} />
      ))}
    </Section>
  );
}
