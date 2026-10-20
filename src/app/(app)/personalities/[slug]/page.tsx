import type { Metadata } from "next";
import { Info, Layers, LibraryBig } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentCard, ProgramCard } from "@/components/catalog";
import { ChipLink, ChipRow } from "@/components/discover/ChipLink";
import { CARD_GRID } from "@/components/discover/grid";
import { InlineError } from "@/components/discover/InlineError";
import { UrlTabs } from "@/components/discover/UrlTabs";
import { Badge, Button, EmptyState, PillarBadge } from "@/components/ui";
import { CONTENT_CARD_SELECT, PROGRAM_CARD_SELECT, type ContentCardData, type ProgramCardData } from "@/lib/catalog/queries";
import { CONTENT_TYPES, type ContentType, type Pillar } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

type Creator = {
  id: string;
  slug: string;
  name: string;
  headline: string | null;
  bio: string | null;
  pillars: Pillar[];
  avatar_url: string | null;
  cover_url: string | null;
  is_fictional: boolean;
  rights_note: string | null;
};

const CREATOR_SELECT = "id, slug, name, headline, bio, pillars, avatar_url, cover_url, is_fictional, rights_note";
const TABS = ["conteudos", "programas"] as const;
type Tab = (typeof TABS)[number];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const parseTab = (value: string | undefined): Tab => ((TABS as readonly string[]).includes(value ?? "") ? (value as Tab) : "conteudos");
const parseType = (value: string | undefined): ContentType | undefined => ((CONTENT_TYPES as string[]).includes(value ?? "") ? (value as ContentType) : undefined);

// RLS: visitantes só enxergam perfis ativos; o próprio criador vê o seu mesmo suspenso.
async function loadCreator(slug: string): Promise<Creator | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("creator_profiles").select(CREATOR_SELECT).eq("slug", slug).maybeSingle();
  return (data as Creator | null) ?? null;
}

function profileHref(slug: string, tab: Tab, type?: ContentType) {
  const sp = new URLSearchParams();
  if (tab !== "conteudos") sp.set("tab", tab);
  if (type && tab === "conteudos") sp.set("type", type);
  const qs = sp.toString();
  return qs ? `/personalities/${slug}?${qs}` : `/personalities/${slug}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [creator, t] = await Promise.all([loadCreator(slug), getTranslations("discover.meta")]);
  if (!creator) return {};
  return { title: t("personality", { name: creator.name }), description: creator.headline ?? undefined };
}

// Perfil da personalidade: capa, identidade (sempre marcada como fictícia), nota de direitos e abas.
export default async function PersonalityPage({ params, searchParams }: Props) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const [creator, t, tcat] = await Promise.all([loadCreator(slug), getTranslations("discover.personalities.profile"), getTranslations("catalog")]);
  if (!creator) notFound();

  const tab = parseTab(first(raw.tab));
  const type = parseType(first(raw.type));

  // Uma query por coleção (sem N+1); contagens e filtro por tipo derivam do mesmo resultado.
  const supabase = await createClient();
  const [contentRes, programRes] = await Promise.all([
    supabase.from("content").select(CONTENT_CARD_SELECT).eq("creator_id", creator.id).eq("status", "published").order("published_at", { ascending: false }).limit(100),
    supabase.from("programs").select(PROGRAM_CARD_SELECT).eq("creator_id", creator.id).eq("status", "published").order("is_featured", { ascending: false }).order("created_at", { ascending: false }).limit(50),
  ]);
  const allContents = (contentRes.data ?? []) as unknown as ContentCardData[];
  const contents = type ? allContents.filter((c) => c.type === type) : allContents;
  const availableTypes = CONTENT_TYPES.filter((ct) => allContents.some((c) => c.type === ct));
  const programs = ((programRes.data ?? []) as unknown as ProgramCardData[]).filter((p) => p.version);

  const cover = creator.cover_url ?? `/placeholders/cover-${creator.pillars[0] ?? "routine"}-2.svg`;
  const avatar = creator.avatar_url ?? "/placeholders/avatar-1.svg";

  const tabs = [
    { value: "conteudos", label: `${t("tabs.contents")} · ${allContents.length}`, href: profileHref(creator.slug, "conteudos", type), icon: <LibraryBig /> },
    { value: "programas", label: `${t("tabs.programs")} · ${programs.length}`, href: profileHref(creator.slug, "programas"), icon: <Layers /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/personalities" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        ← {t("back")}
      </Link>

      <header className="flex flex-col gap-4">
        <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl border border-border bg-surface-elevated sm:aspect-[3/1]">
          <Image src={cover} alt={t("coverAlt", { name: creator.name })} fill priority unoptimized={cover.endsWith(".svg")} sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-obsidian/60 via-transparent to-transparent" />
        </div>

        <div className="-mt-14 flex flex-col gap-4 px-2 sm:-mt-16 sm:flex-row sm:items-end sm:px-4">
          <span className="relative inline-flex size-24 shrink-0 overflow-hidden rounded-full border-4 border-bg bg-surface-elevated shadow-md sm:size-28">
            <Image src={avatar} alt="" fill unoptimized={avatar.endsWith(".svg")} sizes="112px" className="object-cover" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="type-h1 text-balance text-fg">{creator.name}</h1>
              {creator.is_fictional && <Badge variant="demo">{t("fictional")}</Badge>}
            </div>
            {creator.headline && <p className="type-body text-fg-muted">{creator.headline}</p>}
            <ul className="flex flex-wrap gap-1.5" aria-label={t("pillarsLabel")}>
              {creator.pillars.map((pillar) => (
                <li key={pillar}>
                  <PillarBadge pillar={pillar} />
                </li>
              ))}
            </ul>
            <p className="type-caption text-fg-muted">
              {t("stats.contents", { count: allContents.length })} · {t("stats.programs", { count: programs.length })}
            </p>
          </div>
        </div>

        {creator.bio && <p className="type-body max-w-prose whitespace-pre-line text-fg sm:px-4">{creator.bio}</p>}

        {/* Nota de direitos: personagem fictício, sem pessoa real, contrato ou endosso */}
        <aside aria-label={t("rightsTitle")} className={cn("flex gap-3 rounded-xl border border-dashed border-warning/40 bg-warning-soft/40 p-4 sm:mx-4")}>
          <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-fg">{t("rightsTitle")}</p>
            <p className="type-body-sm text-fg-muted">{creator.rights_note?.trim() || t("rightsDefault")}</p>
          </div>
        </aside>
      </header>

      <UrlTabs value={tab} tabs={tabs} aria-label={t("tabs.label")}>
        {tab === "conteudos" ? (
          <div className="flex flex-col gap-4">
            {availableTypes.length > 1 && (
              <ChipRow label={t("typeFilter")}>
                <ChipLink href={profileHref(creator.slug, "conteudos")} selected={!type}>
                  {t("allTypes")}
                </ChipLink>
                {availableTypes.map((ct) => (
                  <ChipLink key={ct} href={profileHref(creator.slug, "conteudos", ct)} selected={type === ct}>
                    {tcat(`types.${ct}`)}
                  </ChipLink>
                ))}
              </ChipRow>
            )}
            {contentRes.error ? (
              <InlineError />
            ) : contents.length === 0 ? (
              <div className="rounded-2xl border border-border bg-surface">
                <EmptyState
                  icon={<LibraryBig />}
                  title={t("contentsEmptyTitle")}
                  description={t("contentsEmptyDescription")}
                  action={
                    type ? (
                      <Button asChild variant="secondary">
                        <Link href={profileHref(creator.slug, "conteudos")}>{t("allTypes")}</Link>
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <ul className={CARD_GRID}>
                {contents.map((content) => (
                  <li key={content.id}>
                    <ContentCard content={content} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : programRes.error ? (
          <InlineError />
        ) : programs.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState icon={<Layers />} title={t("programsEmptyTitle")} description={t("programsEmptyDescription")} />
          </div>
        ) : (
          <ul className={CARD_GRID}>
            {programs.map((program) => (
              <li key={program.id}>
                <ProgramCard program={program} />
              </li>
            ))}
          </ul>
        )}
      </UrlTabs>
    </div>
  );
}
