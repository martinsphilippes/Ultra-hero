import { getTranslations } from "next-intl/server";
import { ContentCard } from "@/components/catalog";
import { Section } from "@/components/ui";
import { CONTENT_CARD_SELECT, type ContentCardData } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";
import { SCROLL_CARD } from "../grid";
import { InlineError } from "../InlineError";

type ProgressRow = { progress_pct: number; updated_at: string; content: ContentCardData | null };

// "Continuar": conteúdos começados e não concluídos (0 < progresso < 100), os mais recentes primeiro.
export async function ContinueSection({ userId }: { userId: string }) {
  const [supabase, t] = await Promise.all([createClient(), getTranslations("discover.home.continue")]);
  const { data, error } = await supabase
    .from("content_progress")
    .select(`progress_pct, updated_at, content:content(${CONTENT_CARD_SELECT})`)
    .eq("user_id", userId)
    .gt("progress_pct", 0)
    .lt("progress_pct", 100)
    .order("updated_at", { ascending: false })
    .limit(6);

  if (error) return <InlineError />;
  // Conteúdo despublicado some pela RLS (content = null): não exibimos o card.
  const rows = ((data ?? []) as unknown as ProgressRow[]).filter((row): row is ProgressRow & { content: ContentCardData } => Boolean(row.content));
  if (rows.length === 0) return null;

  return (
    <Section id="continue" title={t("title")} description={t("description")} scroll>
      {rows.map((row) => (
        <ContentCard key={row.content.id} content={row.content} progressPct={row.progress_pct} className={SCROLL_CARD} />
      ))}
    </Section>
  );
}
