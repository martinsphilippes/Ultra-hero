import type { Metadata } from "next";
import { CircleCheck, Clock, ExternalLink, Info, ShieldAlert, XCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ContentStatusBadges } from "@/components/creator/ContentStatusBadges";
import { CreatorContentForm } from "@/components/creator/CreatorContentForm";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { ReviewTimeline, type ReviewRow } from "@/components/creator/ReviewTimeline";
import { PublishButton, UnpublishButton } from "@/components/creator/PublishButtons";
import { RecipeLegacyNotice } from "@/components/recipes/RecipeLegacyNotice";
import { contentChecklist } from "@/components/editors/content/schema";
import type { ContentFormValues } from "@/components/editors/types";
import { Badge, Button, PageHeader, PillarBadge, PlanBadge, Section } from "@/components/ui";
import type { AccessLevel, ContentType, Enums, LocaleCode, Pillar } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { getMyCreator } from "../../../_lib/creator";

const CONTENT_SELECT =
  "id, slug, title, summary, cover_url, pillar, type, source_locale, duration_minutes, difficulty, tags, has_captions, disclaimer_kind, status, review_status, access_level, required_module_id, completion_mode, published_at, creator_id, " +
  "media_license_kind, media_license_ref, media_credit, required_module:plan_modules(code, name)";

type ContentRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  cover_url: string | null;
  pillar: Pillar;
  type: ContentType;
  source_locale: LocaleCode;
  duration_minutes: number | null;
  difficulty: "beginner" | "intermediate" | "advanced" | null;
  tags: string[];
  has_captions: boolean;
  disclaimer_kind: "general" | "training" | "nutrition" | "none" | null;
  status: Enums<"content_status">;
  review_status: Enums<"review_status">;
  access_level: AccessLevel | null;
  required_module_id: string | null;
  completion_mode: Enums<"completion_mode"> | null;
  published_at: string | null;
  creator_id: string | null;
  media_license_kind: ContentFormValues["media_license_kind"];
  media_license_ref: string | null;
  media_credit: string | null;
  required_module: { code: string; name: string } | null;
};

type BodyRow = { body: unknown; media_provider: ContentFormValues["media"]["provider"]; media_ref: string | null; captions_url: string | null };

type Params = { params: Promise<{ id: string }> };

async function loadContent(id: string): Promise<ContentRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("content").select(CONTENT_SELECT).eq("id", id).maybeSingle();
  return (data as unknown as ContentRow | null) ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return {};
  const content = await loadContent(id);
  return content ? { title: content.title } : {};
}

// Edição de um conteúdo próprio: formulário (somente leitura fora de rascunho), Publicar com o
// checklist como ajuda, Despublicar quando está no ar e o histórico com feedback do admin.
export default async function EditContentPage({ params }: Params) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, tn, tcat, ctx] = await Promise.all([getTranslations("creator"), getTranslations("nav"), getTranslations("catalog"), getMyCreator()]);
  if (!ctx.creatorId) return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} name={ctx.profile?.name} title={tn("creator.content")} />;

  const content = await loadContent(id);
  // RLS só devolve conteúdo próprio; o filtro por creator_id é defesa extra.
  if (!content || content.creator_id !== ctx.creatorId) notFound();

  const supabase = await createClient();
  const [{ data: bodyRow }, { data: reviews }] = await Promise.all([
    supabase.from("content_bodies").select("body, media_provider, media_ref, captions_url").eq("content_id", id).maybeSingle(),
    supabase.from("content_reviews").select("id, round, decision, feedback, submitted_at, decided_at").eq("content_id", id).order("round", { ascending: false }),
  ]);
  const body = (bodyRow as BodyRow | null) ?? null;
  const reviewRows = (reviews ?? []) as ReviewRow[];
  const latest = reviewRows[0] ?? null;

  // Receita fica só para leitura aqui até o editor de receitas (fase 2): sem salvar, publicar nem despublicar.
  const isRecipe = content.type === "recipe";
  const editable = content.status === "draft" && content.review_status !== "in_review" && !isRecipe;
  const checklist = contentChecklist({
    type: content.type,
    title: content.title,
    summary: content.summary,
    cover_url: content.cover_url,
    disclaimer_kind: content.disclaimer_kind,
    body: body?.body ?? null,
    media: body ? { provider: body.media_provider, ref: body.media_ref } : null,
  });

  const initial: Partial<ContentFormValues> = {
    id: content.id,
    title: content.title,
    summary: content.summary ?? "",
    pillar: content.pillar,
    type: content.type,
    source_locale: content.source_locale,
    cover_url: content.cover_url ?? "",
    duration_minutes: content.duration_minutes,
    difficulty: content.difficulty,
    tags: content.tags ?? [],
    has_captions: content.has_captions,
    disclaimer_kind: content.disclaimer_kind,
    body: (body?.body as Record<string, unknown> | undefined) ?? undefined,
    media: body ? { provider: body.media_provider, ref: body.media_ref, captions_url: body.captions_url } : undefined,
    media_license_kind: content.media_license_kind,
    media_license_ref: content.media_license_ref ?? "",
    media_credit: content.media_credit ?? "",
    access_level: content.access_level,
    required_module_id: content.required_module_id,
    completion_mode: content.completion_mode,
  };

  // Situação atual explicada à personalidade.
  const situation =
    content.status === "published"
      ? { tone: "success", icon: CircleCheck, key: "published" as const }
      : content.status === "archived"
        ? { tone: "neutral", icon: Info, key: "archived" as const }
        : content.review_status === "in_review"
          ? { tone: "info", icon: Clock, key: "in_review" as const }
          : content.review_status === "returned"
            ? { tone: "warning", icon: ShieldAlert, key: "returned" as const }
            : content.review_status === "rejected"
              ? { tone: "danger", icon: XCircle, key: "rejected" as const }
              : { tone: "neutral", icon: Info, key: "draft" as const };
  const toneClass: Record<string, string> = {
    success: "border-success/30 bg-success-soft text-fg",
    info: "border-info/30 bg-info-soft text-fg",
    warning: "border-warning/30 bg-warning-soft text-fg",
    danger: "border-danger/30 bg-danger-soft text-fg",
    neutral: "border-border bg-surface-elevated text-fg",
  };
  const SituationIcon = situation.icon;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={content.title}
        eyebrow={tn("creator.content")}
        backHref="/creator/content"
        backLabel={tn("creator.content")}
      >
        {/* Ações abaixo do título: no celular não espremem o cabeçalho. */}
        {content.status !== "archived" && (
          <div className="flex flex-wrap items-center gap-2">
            {content.status === "draft" && !isRecipe && <PublishButton contentId={content.id} checklist={checklist} />}
            {content.status === "published" && (
              <Button asChild variant="secondary" trailingIcon={<ExternalLink />}>
                <Link href={`/content/${content.slug}`}>{t("content.viewPublic")}</Link>
              </Button>
            )}
            {content.status === "published" && !isRecipe && <UnpublishButton contentId={content.id} />}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <ContentStatusBadges status={content.status} review={content.review_status} size="md" />
          <PillarBadge tone="pillar" pillar={content.pillar} />
          <Badge>{tcat(`types.${content.type}`)}</Badge>
          {content.access_level ? <PlanBadge plan={content.access_level} /> : <Badge variant="warning">{t("edit.noAccessRule")}</Badge>}
          {content.required_module && <Badge variant="accent">{content.required_module.name}</Badge>}
        </div>
      </PageHeader>

      <div role="status" className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", toneClass[situation.tone])}>
        <SituationIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{t(`edit.situation.${situation.key}.title`)}</p>
          <p className="type-body-sm text-fg-muted">{t(`edit.situation.${situation.key}.description`)}</p>
          {(situation.key === "returned" || situation.key === "rejected") && latest?.feedback && (
            <blockquote className="mt-1 rounded-lg border-l-4 border-accent/50 bg-surface px-3 py-2 text-sm text-fg">
              <span className="font-semibold">{t("reviews.feedback")}: </span>
              {latest.feedback}
            </blockquote>
          )}
        </div>
      </div>

      {isRecipe && <RecipeLegacyNotice />}

      <p className="type-caption text-fg-muted">{t("edit.accessNote")}</p>

      <CreatorContentForm mode="edit" initial={initial} readOnly={!editable} />

      <Section id="review-timeline" title={t("reviews.title")} description={t("reviews.description")}>
        <ReviewTimeline reviews={reviewRows} />
      </Section>
    </div>
  );
}
