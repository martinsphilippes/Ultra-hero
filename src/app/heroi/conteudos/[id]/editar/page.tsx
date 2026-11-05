import type { Metadata } from "next";
import { CircleCheck, Clock, ExternalLink, Info, Send, ShieldAlert, XCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ContentStatusBadges } from "@/components/creator/ContentStatusBadges";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { CreatorContentEditor } from "@/components/creator/content/CreatorContentEditor";
import { CampaignBanner } from "@/components/hero-work/CampaignBanner";
import { ReplacePostPhoto } from "@/components/creator/ReplacePostPhoto";
import { ArchiveContentButton, PublishButton, SubmitReviewButton, UnarchiveContentButton, UnpublishButton, WithdrawReviewButton } from "@/components/creator/PublishButtons";
import { ReviewTimeline, type ReviewRow } from "@/components/creator/ReviewTimeline";
import { contentChecklist } from "@/components/editors/content/schema";
import type { ContentFormValues } from "@/components/editors/types";
import { Badge, Button, PageHeader, PillarBadge, Section } from "@/components/ui";
import { hasRole } from "@/lib/auth/session";
import { campaignReturnHref } from "@/lib/hero-work/campaign";
import { loadHeroCampaign } from "@/lib/hero-work/campaign-server";
import { creatorCanEdit, creatorPublishStep } from "@/lib/creator-content/rules";
import { loadComposerOptions, loadPostBlocks } from "@/lib/post-blocks/queries";
import { draftsFromBlocks } from "@/lib/post-blocks/schema";
import { getPostPhotoState } from "@/lib/post-photo/availability";
import type { ContentType, Enums, LocaleCode, Pillar } from "@/lib/supabase/helpers";
import { cn } from "@/lib/utils";
import { getContentWorkspace, getManagedCreator } from "../../../_lib/creator";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ campanha?: string }> };

const CONTENT_SELECT =
  "id, slug, title, summary, cover_url, pillar, type, source_locale, duration_minutes, difficulty, tags, has_captions, disclaimer_kind, status, review_status, published_at, creator_id, media_license_kind, archived_by";

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
  difficulty: ContentFormValues["difficulty"];
  tags: string[] | null;
  has_captions: boolean;
  disclaimer_kind: ContentFormValues["disclaimer_kind"];
  status: Enums<"content_status">;
  review_status: Enums<"review_status">;
  published_at: string | null;
  archived_by: string | null;
  creator_id: string | null;
  media_license_kind: ContentFormValues["media_license_kind"];
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("creator.content") };
}

const TONE: Record<string, string> = {
  success: "border-success/30 bg-success-soft text-fg",
  info: "border-info/30 bg-info-soft text-fg",
  warning: "border-warning/30 bg-warning-soft text-fg",
  danger: "border-danger/30 bg-danger-soft text-fg",
  neutral: "border-border bg-surface-elevated text-fg",
};

// Conteúdo do creator (0092): editor por blocos (só leitura fora do rascunho), Publicar ou Enviar para revisão
// (regra do tipo), Retirar da revisão, Tirar do ar e Arquivar (o que já esteve no ar só o titular) e o histórico.
// Receita segue no Portal do Chef. O admin continua no módulo de conteúdo do admin (sem mudança).
// ?campanha= (pedido do responsável, 04/11): rascunho criado a partir da campanha mostra a faixa dela e, publicado, o
// atalho "Enviar como entrega" (volta para a campanha com o link público pronto).
export default async function EditContentPage({ params, searchParams }: Params) {
  const { id } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  if (await hasRole("admin")) {
    const ctx = await getManagedCreator("content");
    if (!ctx.creatorId) {
      const tn = await getTranslations("nav");
      return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} title={tn("creator.content")} />;
    }
    const { data } = await ctx.supabase.from("content").select("id, type").eq("id", id).maybeSingle();
    if (!data) notFound();
    redirect(data.type === "recipe" ? `/heroi/receitas/${id}/editar` : `/admin/content/${id}`);
  }

  const [t, tn, tcat, tnc, ctx] = await Promise.all([
    getTranslations("creator"),
    getTranslations("nav"),
    getTranslations("catalog"),
    getTranslations("creator.newContent"),
    getContentWorkspace("content", { followChoice: true }),
  ]);
  if (!ctx.creatorId) return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} name={ctx.profile?.name} title={tn("creator.content")} />;
  const supabase = ctx.supabase;

  const { data: row } = await supabase.from("content").select(CONTENT_SELECT).eq("id", id).maybeSingle();
  const content = (row as ContentRow | null) ?? null;
  // RLS só devolve conteúdo do Hero em uso; o filtro por creator_id é defesa extra (e não revela ids)
  if (!content || content.creator_id !== ctx.creatorId) notFound();
  if (content.type === "recipe") redirect(`/heroi/receitas/${id}/editar`);

  const [{ data: bodyRow }, { data: reviews }, { data: setting }, blocks, linksRes, coverState, options, campaign] = await Promise.all([
    supabase.from("content_bodies").select("body, media_provider, media_ref, captions_url").eq("content_id", id).maybeSingle(),
    supabase.from("content_reviews").select("id, round, decision, feedback, submitted_at, decided_at").eq("content_id", id).order("round", { ascending: false }),
    supabase.from("content_type_settings").select("review_required").eq("type", content.type).maybeSingle(),
    loadPostBlocks(supabase, id),
    // validados e sugestões do creator (a sugestão espera a validação do admin)
    supabase.from("content_product_links").select("product_id, status").eq("content_id", id).in("status", ["validated", "suggested"]),
    getPostPhotoState(),
    loadComposerOptions(supabase, ctx.creatorId),
    loadHeroCampaign(sp.campanha),
  ]);
  const reviewRows = (reviews ?? []) as ReviewRow[];
  const latest = reviewRows[0] ?? null;
  // mesma regra do banco (content_review_required): tipo sem linha exige revisão
  const reviewRequired = setting?.review_required ?? true;
  // Hero pendente (0092): o rascunho fica guardado; publicar só depois da aprovação do admin
  const heroPending = ctx.profile?.status === "pending";
  const step = creatorPublishStep({ status: content.status, reviewStatus: content.review_status, reviewRequired });
  const editable = creatorCanEdit({ status: content.status, reviewStatus: content.review_status, type: content.type });
  const everPublished = content.published_at !== null;

  const checklist = contentChecklist({
    type: content.type,
    title: content.title,
    summary: content.summary,
    cover_url: content.cover_url,
    disclaimer_kind: content.disclaimer_kind,
    body: bodyRow?.body ?? null,
    media: bodyRow ? { provider: bodyRow.media_provider, ref: bodyRow.media_ref } : null,
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
    body: (bodyRow?.body as Record<string, unknown> | undefined) ?? undefined,
    media: bodyRow ? { provider: bodyRow.media_provider as ContentFormValues["media"]["provider"], ref: bodyRow.media_ref, captions_url: bodyRow.captions_url } : undefined,
    media_license_kind: content.media_license_kind,
    media_license_ref: "",
    media_credit: "",
  };

  const situation =
    step === "published"
      ? { tone: "success", icon: CircleCheck, key: "published" as const }
      : step === "archived"
        ? { tone: "neutral", icon: Info, key: "archived" as const }
        : step === "in_review"
          ? { tone: "info", icon: Clock, key: "in_review" as const }
          : content.review_status === "returned"
            ? { tone: "warning", icon: ShieldAlert, key: "returned" as const }
            : content.review_status === "rejected"
              ? { tone: "danger", icon: XCircle, key: "rejected" as const }
              : { tone: "neutral", icon: Info, key: step === "submit" ? ("draftReview" as const) : ("draft" as const) };
  const SituationIcon = situation.icon;
  // arquivar: o rascunho que nunca foi ao ar qualquer um da equipe; o que já esteve no ar só o titular
  const canArchive = step !== "archived" && (!everPublished || ctx.canRemove);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={content.title} eyebrow={ctx.profile?.name ?? tn("creator.content")} backHref="/heroi/conteudos" backLabel={tn("creator.content")}>
        {/* ações abaixo do título: no celular não espremem o cabeçalho */}
        {step === "archived" && content.archived_by === "creator" && (
          <div className="flex flex-wrap items-center gap-2" data-testid="creator-content-actions">
            <UnarchiveContentButton contentId={content.id} />
          </div>
        )}
        {step !== "archived" && (
          <div className="flex flex-wrap items-center gap-2" data-testid="creator-content-actions">
            {step === "publish" && heroPending && (
              <p className="type-caption text-fg-muted" data-testid="publish-after-approval">
                {tnc("publishAfterApproval")}
              </p>
            )}
            {step === "publish" && !heroPending && <PublishButton contentId={content.id} checklist={checklist} />}
            {step === "submit" && !heroPending && <SubmitReviewButton contentId={content.id} />}
            {step === "in_review" && <WithdrawReviewButton contentId={content.id} />}
            {step === "published" && (
              <Button asChild variant="secondary" trailingIcon={<ExternalLink />}>
                <Link href={`/content/${content.slug}`}>{t("content.viewPublic")}</Link>
              </Button>
            )}
            {step === "published" && ctx.canRemove && <UnpublishButton contentId={content.id} />}
            {canArchive && <ArchiveContentButton contentId={content.id} />}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <ContentStatusBadges status={content.status} review={content.review_status} size="md" />
          <PillarBadge tone="pillar" pillar={content.pillar} />
          <Badge>{tcat(`types.${content.type}`)}</Badge>
        </div>
      </PageHeader>

      {campaign ? <CampaignBanner campaign={campaign} note={step === "published" ? null : tnc("campaignPublishNote")} /> : null}
      {campaign && step === "published" ? (
        <Button asChild size="lg" block leadingIcon={<Send />} className="min-h-14" data-testid="content-send-campaign">
          <Link href={campaignReturnHref(campaign.id, content.slug)}>{tnc("campaignSend")}</Link>
        </Button>
      ) : null}

      <div role="status" className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", TONE[situation.tone])}>
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

      {step === "published" && !ctx.canRemove ? (
        <p className="type-caption text-fg-muted" data-testid="owner-only-note">
          {tnc("ownerOnly")}
        </p>
      ) : null}

      {/* foto do post rápido: no rascunho dá para trocar (depois de despublicar ou desarquivar) */}
      {editable && bodyRow?.media_provider === "upload" && bodyRow.media_ref ? (
        <ReplacePostPhoto contentId={content.id} photoUrl={content.cover_url} />
      ) : null}

      <CreatorContentEditor
        key={bodyRow?.media_ref ?? "sem-midia"}
        mode="edit"
        initial={initial}
        readOnly={!editable}
        heroId={ctx.creatorId}
        heroes={ctx.heroes}
        defaultHero={null}
        coverState={coverState}
        options={options}
        initialBlocks={{ drafts: draftsFromBlocks(blocks), products: (linksRes.data ?? []).map((l) => l.product_id) }}
      />

      <Section id="review-timeline" title={t("reviews.title")} description={t("reviews.description")}>
        <ReviewTimeline reviews={reviewRows} />
      </Section>
    </div>
  );
}
