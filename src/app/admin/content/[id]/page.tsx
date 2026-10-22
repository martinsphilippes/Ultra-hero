import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Pencil } from "lucide-react";
import { StatusBadge } from "@/components/admin";
import { JsonView, KeyValue, Panel } from "@/components/admin-content";
import { ContentReviewActions } from "@/components/admin-content/ContentReviewActions";
import { summarizeBody } from "@/components/admin-content/lib/body-summary";
import { isScheduled } from "@/components/admin-content/lib/publish-at";
import { Badge, Button, PageHeader, PillarBadge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { Enums } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Detalhe de um conteúdo para o admin: metadados, corpo (resumo + JSON), histórico de revisão e ações.

type Content = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  cover_url: string | null;
  pillar: Enums<"pillar">;
  type: Enums<"content_type">;
  source_locale: Enums<"locale_code">;
  duration_minutes: number | null;
  difficulty: "beginner" | "intermediate" | "advanced" | null;
  tags: string[];
  has_captions: boolean;
  status: Enums<"content_status">;
  review_status: Enums<"review_status">;
  access_level: Enums<"access_level"> | null;
  completion_mode: Enums<"completion_mode"> | null;
  is_featured: boolean;
  featured_rank: number | null;
  disclaimer_kind: string | null;
  published_at: string | null;
  publish_at: string | null;
  archived_at: string | null;
  media_license_kind: "platform_demo" | "own" | "licensed" | "third_party_embed";
  media_license_ref: string | null;
  media_credit: string | null;
  creator_link_origin: "creator_submission" | "admin_assignment" | null;
  created_at: string;
  updated_at: string;
  creator: { id: string; name: string; is_fictional: boolean } | null;
  required_module: { code: string; name: string } | null;
};

type Body = { body: unknown; media_provider: Enums<"media_provider">; media_ref: string | null; captions_url: string | null; updated_at: string };
type Review = { id: string; round: number; submitted_at: string; decision: Enums<"review_status">; feedback: string | null; decided_at: string | null };

const CONTENT_SELECT =
  "id, slug, title, summary, cover_url, pillar, type, source_locale, duration_minutes, difficulty, tags, has_captions, status, review_status, access_level, completion_mode, is_featured, featured_rank, disclaimer_kind, published_at, publish_at, archived_at, " +
  "media_license_kind, media_license_ref, media_credit, creator_link_origin, created_at, updated_at, " +
  "creator:creator_profiles(id, name, is_fictional), required_module:plan_modules(code, name)";

async function loadContent(id: string): Promise<Content | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("content").select(CONTENT_SELECT).eq("id", id).maybeSingle();
  return (data as unknown as Content | null) ?? null;
}

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const content = await loadContent(id);
  return { title: content?.title ?? "" };
}

export default async function AdminContentDetailPage({ params }: Params) {
  const { id } = await params;
  const content = await loadContent(id);
  if (!content) notFound();

  const supabase = await createClient();
  const [t, tc, ts, locale, bodyRes, reviewsRes] = await Promise.all([
    getTranslations("adminContent.content"),
    getTranslations("adminContent.common"),
    getTranslations("adminCommon.status"),
    getLocale(),
    supabase.from("content_bodies").select("body, media_provider, media_ref, captions_url, updated_at").eq("content_id", id).maybeSingle(),
    supabase.from("content_reviews").select("id, round, submitted_at, decision, feedback, decided_at").eq("content_id", id).order("round", { ascending: false }),
  ]);
  const body = (bodyRes.data as Body | null) ?? null;
  const reviews = (reviewsRes.data ?? []) as Review[];
  const hasOpenRound = reviews.some((r) => r.decision === "in_review");
  const uiLocale = locale as Locale;
  const summary = body ? summarizeBody(content.type, body.body) : null;
  const scheduled = isScheduled(content.status, content.publish_at);

  const summaryText = (() => {
    if (!summary || summary.kind === "empty") return t("summary.empty");
    switch (summary.kind) {
      case "video":
        return t("summary.video", { points: summary.points, transcript: summary.transcript });
      case "recipe":
        return `${t("summary.recipe", { ingredients: summary.ingredients, steps: summary.steps, servings: summary.servings })} · ${summary.allergens.length ? t("summary.allergens", { list: summary.allergens.join(", ") }) : t("summary.noAllergens")}`;
      case "workout":
        return `${t("summary.workout", { blocks: summary.blocks, exercises: summary.exercises })} · ${summary.safetyNote ? t("summary.safetyNote") : t("summary.noSafetyNote")}`;
      case "guide":
        return t("summary.guide", { sections: summary.sections, points: summary.points });
      default:
        return t("summary.article", { sections: summary.sections });
    }
  })();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("detail.eyebrow")}
        title={content.title}
        description={content.summary ?? undefined}
        backHref="/admin/content"
        backLabel={tc("backToList")}
        actions={
          <>
            {content.status === "published" && (
              <Button asChild variant="ghost" size="sm" leadingIcon={<ExternalLink />}>
                <Link href={`/content/${content.slug}`}>{t("detail.openPublic")}</Link>
              </Button>
            )}
            <Button asChild size="sm" variant="secondary" leadingIcon={<Pencil />}>
              <Link href={`/admin/content/${content.id}/edit`}>{tc("edit")}</Link>
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <PillarBadge tone="pillar" pillar={content.pillar} size="sm" />
          <Badge size="sm">{tc(`types.${content.type}`)}</Badge>
          <StatusBadge status={content.status} label={ts(content.status)} />
          {scheduled && content.publish_at && (
            <Badge variant="info" size="sm">
              {t("schedule.scheduledFor", { date: formatDateTime(content.publish_at, uiLocale) })}
            </Badge>
          )}
          <StatusBadge status={content.review_status} label={ts(content.review_status)} />
          {content.access_level ? (
            <Badge variant={content.access_level} size="sm">
              {tc(`access.${content.access_level}`)}
            </Badge>
          ) : (
            <Badge variant="warning" size="sm">
              {tc("access.undefined")}
            </Badge>
          )}
          {content.is_featured && (
            <Badge variant="accent" size="sm">
              {t("featured")}
              {content.featured_rank ? ` #${content.featured_rank}` : ""}
            </Badge>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title={t("detail.metadata")}>
            {!content.access_level && (
              <p role="note" className="rounded-lg border border-warning/40 bg-warning-soft/50 px-3 py-2 text-sm text-fg">
                {t("detail.noAccessRule")}
              </p>
            )}
            <KeyValue
              items={[
                { label: tc("creator"), value: content.creator ? `${content.creator.name}${content.creator.is_fictional ? ` · ${tc("fictional")}` : ""}` : tc("noCreator") },
                { label: t("detail.linkOrigin"), value: content.creator_link_origin ? tc(`linkOrigin.${content.creator_link_origin}`) : tc("none") },
                { label: t("detail.license"), value: tc(`license.${content.media_license_kind}`) },
                { label: t("detail.credit"), value: content.media_credit ?? tc("none") },
                { label: t("detail.licenseRef"), value: content.media_license_ref ?? tc("none") },
                { label: t("detail.slugLabel"), value: <code className="font-mono text-xs">{content.slug}</code> },
                { label: tc("sourceLocale"), value: tc(`localeName.${content.source_locale}`) },
                { label: t("detail.duration"), value: content.duration_minutes ? t("detail.minutes", { n: content.duration_minutes }) : tc("none") },
                { label: t("detail.difficulty"), value: content.difficulty ? tc(`difficulty.${content.difficulty}`) : tc("none") },
                { label: t("detail.requiredModule"), value: content.required_module ? `${content.required_module.name} (${content.required_module.code})` : tc("none") },
                { label: t("detail.completionMode"), value: content.completion_mode ? tc(`completionMode.${content.completion_mode}`) : tc("completionMode.inherit") },
                { label: t("detail.captions"), value: content.has_captions ? t("detail.captionsYes") : t("detail.captionsNo") },
                { label: t("detail.disclaimer"), value: content.disclaimer_kind ?? tc("none") },
                { label: t("detail.tags"), value: content.tags.length ? content.tags.join(", ") : tc("none") },
                { label: tc("labels.created"), value: formatDateTime(content.created_at, uiLocale) },
                { label: tc("labels.updated"), value: formatDateTime(content.updated_at, uiLocale) },
                { label: tc("labels.published"), value: content.published_at ? formatDateTime(content.published_at, uiLocale) : tc("none") },
                ...(scheduled && content.publish_at ? [{ label: t("detail.publishAt"), value: formatDateTime(content.publish_at, uiLocale) }] : []),
                ...(content.archived_at ? [{ label: tc("labels.archived"), value: formatDateTime(content.archived_at, uiLocale) }] : []),
              ]}
            />
          </Panel>

          <Panel title={t("detail.body")}>
            {body ? (
              <div className="flex flex-col gap-3">
                <KeyValue
                  items={[
                    { label: t("detail.bodySummary"), value: summaryText, wide: true },
                    { label: t("detail.mediaProvider"), value: body.media_provider },
                    { label: t("detail.mediaRef"), value: body.media_ref ?? tc("none") },
                    { label: t("detail.captions"), value: body.captions_url ?? tc("none") },
                    { label: tc("labels.updated"), value: formatDateTime(body.updated_at, uiLocale) },
                  ]}
                />
                <JsonView value={body.body} summary={t("detail.bodyJson")} />
              </div>
            ) : (
              <p role="note" className="rounded-lg border border-warning/40 bg-warning-soft/50 px-3 py-2 text-sm text-fg">
                {t("detail.bodyMissing")}
              </p>
            )}
          </Panel>

          <Panel title={t("detail.reviews")}>
            {reviews.length === 0 ? (
              <p className="text-sm text-fg-muted">{t("detail.reviewsEmpty")}</p>
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {reviews.map((review) => (
                  <li key={review.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-fg">{t("detail.round", { n: review.round })}</span>
                      <StatusBadge status={review.decision} label={ts(review.decision)} />
                      <span className="type-caption text-fg-muted">{t("detail.submittedAt", { date: formatDateTime(review.submitted_at, uiLocale) })}</span>
                      {review.decided_at ? (
                        <span className="type-caption text-fg-muted">{t("detail.decidedAt", { date: formatDateTime(review.decided_at, uiLocale) })}</span>
                      ) : (
                        <span className="type-caption text-info">{t("detail.pending")}</span>
                      )}
                    </div>
                    <p className="text-sm text-fg-muted">{review.feedback ? review.feedback : t("detail.noFeedback")}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Panel title={tc("actions")}>
            <ContentReviewActions contentId={content.id} type={content.type} status={content.status} reviewStatus={content.review_status} isFeatured={content.is_featured} hasOpenRound={hasOpenRound} publishAt={content.publish_at} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
