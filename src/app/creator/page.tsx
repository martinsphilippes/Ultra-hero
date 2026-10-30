import type { Metadata } from "next";
import { ArrowRight, FilePen, Link2 } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { ReviewTimeline, type ReviewRow } from "@/components/creator/ReviewTimeline";
import { Avatar, Badge, Card, CardBody, PageHeader, Section } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatRelativeTime } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { getManagedCreator } from "./_lib/creator";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.creator")} · ${t("creator.dashboard")}` };
}

type StatusRow = { status: "draft" | "published" | "archived"; review_status: "none" | "in_review" | "returned" | "approved" | "rejected" };

// Painel do herói escolhido pelo admin (Publicar como hero): contagens por status/revisão, devolvidos
// com feedback e últimas revisões. O herói comum volta ao Perfil (só o Novo post é dele).
export default async function CreatorHomePage() {
  const [t, tn, tcat, locale, ctx] = await Promise.all([getTranslations("creator"), getTranslations("nav"), getTranslations("catalog"), getLocale(), getManagedCreator("dashboard")]);
  if (!ctx.creatorId || !ctx.profile) return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} name={ctx.profile?.name} />;

  const supabase = ctx.supabase;
  const [{ data: rows }, { data: reviews }, { data: returned }] = await Promise.all([
    supabase.from("content").select("status, review_status").eq("creator_id", ctx.creatorId),
    // o admin lê todas as revisões: o filtro pelo herói escolhido fica explícito
    supabase.from("content_reviews").select("id, round, decision, feedback, submitted_at, decided_at, content:content!inner(id, title)").eq("content.creator_id", ctx.creatorId).order("submitted_at", { ascending: false }).limit(6),
    supabase.from("content").select("id, title, updated_at").eq("creator_id", ctx.creatorId).eq("review_status", "returned").order("updated_at", { ascending: false }).limit(5),
  ]);

  const list = (rows ?? []) as StatusRow[];
  const counts = {
    draft: list.filter((r) => r.status === "draft" && r.review_status !== "in_review").length,
    in_review: list.filter((r) => r.status === "draft" && r.review_status === "in_review").length,
    returned: list.filter((r) => r.review_status === "returned").length,
    published: list.filter((r) => r.status === "published").length,
    archived: list.filter((r) => r.status === "archived").length,
  };
  const uiLocale = locale as Locale;
  const stats: { key: keyof typeof counts; href: string; tone: string }[] = [
    { key: "draft", href: "/creator/content?status=draft", tone: "text-fg" },
    { key: "in_review", href: "/creator/content?review=in_review", tone: "text-info" },
    { key: "returned", href: "/creator/content?review=returned", tone: "text-warning" },
    { key: "published", href: "/creator/content?status=published", tone: "text-success" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("dashboard.title", { name: ctx.profile.name })}
        description={t("dashboard.description")}
        eyebrow={tn("portals.creator")}
      >
        {/* Novo post e Novo conteúdo ficam nos atalhos de "Publicar como hero" no início do admin. */}
        <div className="flex items-center gap-3">
          <Avatar src={ctx.profile.avatar_url} name={ctx.profile.name} size="md" alt="" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-fg">{ctx.profile.name}</span>
            <span className="flex flex-wrap items-center gap-1.5">
              {ctx.profile.is_fictional && <Badge variant="demo" size="sm">{tcat("fictional")}</Badge>}
              {ctx.profile.headline && <span className="type-caption truncate text-fg-muted">{ctx.profile.headline}</span>}
            </span>
          </div>
        </div>
      </PageHeader>

      <section aria-labelledby="creator-stats" className="flex flex-col gap-3">
        <h2 id="creator-stats" className="sr-only">
          {t("dashboard.stats")}
        </h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <li key={s.key}>
              <Card interactive asChild>
                <Link href={s.href} className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  <CardBody>
                    <span className="type-overline text-fg-muted">{t(`dashboard.counts.${s.key}`)}</span>
                    <span className={cn("text-3xl font-bold tabular-nums", s.tone)}>{counts[s.key]}</span>
                  </CardBody>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
        {counts.archived > 0 && <p className="type-caption text-fg-muted">{t("dashboard.archived", { count: counts.archived })}</p>}
      </section>

      {(returned ?? []).length > 0 && (
        <Section id="returned" title={t("dashboard.returnedTitle")} description={t("dashboard.returnedDescription")}>
          <ul className="flex flex-col gap-2">
            {(returned ?? []).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/creator/content/${c.id}/edit`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-2 text-sm text-fg hover:border-warning focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FilePen className="size-4 shrink-0 text-warning" aria-hidden="true" />
                    <span className="truncate font-medium">{c.title}</span>
                  </span>
                  <span className="type-caption shrink-0 text-fg-muted">{formatRelativeTime(c.updated_at, uiLocale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section id="latest-reviews" title={t("dashboard.latestReviews")} href="/creator/content" seeAllLabel={t("dashboard.seeContent")}>
        <ReviewTimeline reviews={(reviews ?? []) as unknown as ReviewRow[]} showContent compact />
      </Section>

      {/* O perfil do herói mora na tela Perfil (/profile): aqui fica só o atalho dos vínculos. */}
      <div className="grid gap-3">
        <Card interactive asChild>
          <Link href="/creator/links" className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            <CardBody className="flex-row items-center gap-3">
              <Link2 className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold text-fg">{tn("creator.links")}</span>
                <span className="type-caption text-fg-muted">{t("dashboard.linksHint")}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            </CardBody>
          </Link>
        </Card>
      </div>
    </div>
  );
}
