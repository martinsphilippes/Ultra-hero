import { Sparkles } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { ContentCard } from "@/components/catalog";
import { RecommendationItem } from "@/components/me/RecommendationItem";
import { RecommendationsTracker } from "@/components/me/RecommendationsTracker";
import { Badge, Section } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatRelativeTime } from "@/i18n/format";
import { CONTENT_CARD_SELECT, liveContentFilter, localizedLabel, type ContentCardData } from "@/lib/catalog/queries";
import { parseReason } from "@/lib/recommendations/reasons";
import { recalculateRecommendations } from "@/lib/recommendations/recalculate";
import type { EngineName, Reason } from "@/lib/recommendations/types";
import { RECOMMENDATION_LIMIT, STALE_AFTER_MS } from "@/lib/recommendations/types";
import { createClient } from "@/lib/supabase/server";

// Seção "Para você" do Início. Logado: user_recommendations (recalcula se vazio/antigo > 6h).
// Visitante: "Sugestões abertas" (destaques gratuitos, sem personalização). Motor sempre identificado.

type RecRow = { content_id: string; rank: number; reason: string | null; engine: EngineName; is_fallback: boolean; generated_at: string };
type CardData = ContentCardData & { required_module_id: string | null };

async function loadCards(ids: string[]): Promise<Map<string, CardData>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from("content").select(`${CONTENT_CARD_SELECT}, required_module_id`).in("id", ids).eq("status", "published").or(liveContentFilter());
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as unknown as CardData[]).map((c) => [c.id, c]));
}

async function loadPersonal(userId: string): Promise<{ rows: RecRow[]; persisted: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_recommendations")
    .select("content_id, rank, reason, engine, is_fallback, generated_at")
    .eq("user_id", userId)
    .order("rank", { ascending: true })
    .limit(RECOMMENDATION_LIMIT);
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as RecRow[];
  const newest = rows[0]?.generated_at ? new Date(rows[0].generated_at).getTime() : 0;
  const stale = rows.length === 0 || Date.now() - newest > STALE_AFTER_MS;
  if (!stale) return { rows, persisted: true };

  const result = await recalculateRecommendations(userId, "stale");
  if (result.persisted) {
    const { data: fresh } = await supabase
      .from("user_recommendations")
      .select("content_id, rank, reason, engine, is_fallback, generated_at")
      .eq("user_id", userId)
      .order("rank", { ascending: true })
      .limit(RECOMMENDATION_LIMIT);
    rows = (fresh ?? []) as RecRow[];
    return { rows, persisted: true };
  }
  // Sem service role: usa o resultado em memória (avisado no log pelo recalculate).
  rows = result.recommendations.map((rec, index) => ({
    content_id: rec.content_id,
    rank: index + 1,
    reason: JSON.stringify(rec.reason),
    engine: result.engine,
    is_fallback: result.is_fallback,
    generated_at: result.generated_at,
  }));
  return { rows, persisted: false };
}

export async function RecommendationsSection({ userId, className }: { userId: string | null; className?: string }) {
  const [t, tp, locale] = await Promise.all([getTranslations("me.recommendations"), getTranslations("common.pillars"), getLocale()]);
  const uiLocale = locale as Locale;

  try {
    if (!userId) {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("content")
        .select(CONTENT_CARD_SELECT)
        .eq("status", "published")
        .or(liveContentFilter())
        .eq("access_level", "free")
        .order("is_featured", { ascending: false })
        .order("featured_rank", { ascending: true, nullsFirst: false })
        .order("published_at", { ascending: false })
        .limit(RECOMMENDATION_LIMIT);
      if (error) throw new Error(error.message);
      const cards = (data ?? []) as unknown as ContentCardData[];
      if (cards.length === 0) return null;
      return (
        <Section id="recommendations" title={t("titleVisitor")} description={t("descriptionVisitor")} className={className}>
          <RecommendationsTracker engine="open_picks" isFallback={false} count={cards.length} />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("titleVisitor")}>
            {cards.map((content, index) => (
              <li key={content.id}>
                <ContentCard content={content} priority={index === 0} />
              </li>
            ))}
          </ul>
          <p className="type-caption text-fg-muted">{t("disclaimer")}</p>
        </Section>
      );
    }

    const supabase = await createClient();
    const [{ rows }, dismissed, entitled, tags] = await Promise.all([
      loadPersonal(userId),
      supabase.from("not_interested").select("content_id").eq("user_id", userId),
      supabase.rpc("my_entitled_modules"),
      supabase.from("interest_tags").select("tag, label"),
    ]);
    const hidden = new Set((dismissed.data ?? []).map((r) => r.content_id));
    const entitledSet = new Set<string>(Array.isArray(entitled.data) ? (entitled.data as string[]) : []);
    const tagLabels = new Map((tags.data ?? []).map((row) => [row.tag, localizedLabel(row.label, uiLocale)]));

    const visible = rows.filter((row) => !hidden.has(row.content_id));
    const cards = await loadCards(visible.map((r) => r.content_id));
    const items = visible.filter((row) => cards.has(row.content_id)).slice(0, RECOMMENDATION_LIMIT);

    const engine: EngineName = items[0]?.engine ?? rows[0]?.engine ?? "deterministic";
    const isFallback = items[0]?.is_fallback ?? true;
    const generatedAt = items[0]?.generated_at ?? null;

    const reasonText = (reason: Reason): string => {
      switch (reason.key) {
        case "interest": {
          const tag = String(reason.params?.tag ?? "");
          return t("reasons.interest", { tag: tagLabels.get(tag) ?? tag });
        }
        case "pillar": {
          const pillar = String(reason.params?.pillar ?? "");
          return t("reasons.pillar", { pillar: tp.has(pillar) ? tp(pillar) : pillar });
        }
        case "text":
          return t("reasons.text", { text: String(reason.params?.text ?? "") });
        case "difficulty":
        case "fresh":
        case "featured":
          return t(`reasons.${reason.key}`);
        default:
          return t("reasons.generic");
      }
    };

    return (
      <Section
        id="recommendations"
        title={t("title")}
        description={t("description")}
        className={className}
        action={
          <Badge variant={isFallback ? "neutral" : "accent"} icon={<Sparkles />} title={t("engine.label")}>
            {t(`engine.${engine}`)}
          </Badge>
        }
      >
        <RecommendationsTracker engine={engine} isFallback={isFallback} count={items.length} />
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong bg-surface/60 px-4 py-6 text-center type-body-sm text-fg-muted">{t("empty")}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("title")}>
            {items.map((row, index) => {
              const content = cards.get(row.content_id)!;
              const locked = content.access_level === "premium" && content.required_module_id !== null && !entitledSet.has(content.required_module_id);
              return (
                <RecommendationItem
                  key={row.content_id}
                  contentId={row.content_id}
                  title={content.title}
                  rank={row.rank}
                  engine={row.engine}
                  reason={reasonText(parseReason(row.reason))}
                  lockedNote={locked ? t("locked", { module: content.required_module?.name ?? "" }) : null}
                >
                  <ContentCard content={content} priority={index === 0} />
                </RecommendationItem>
              );
            })}
          </ul>
        )}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-fg-muted">
          <span>{t("disclaimer")}</span>
          {generatedAt ? <span>· {formatRelativeTime(generatedAt, uiLocale)}</span> : null}
        </p>
      </Section>
    );
  } catch (error) {
    console.error("[RecommendationsSection]", error);
    return (
      <Section id="recommendations" title={userId ? t("title") : t("titleVisitor")} className={className}>
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 type-body-sm text-fg">
          {t("error")}
        </p>
      </Section>
    );
  }
}
