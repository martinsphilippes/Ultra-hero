import type { Metadata } from "next";
import { Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CreatorCard } from "@/components/catalog";
import { ChipLink, ChipRow } from "@/components/discover/ChipLink";
import { CARD_GRID } from "@/components/discover/grid";
import { InlineError } from "@/components/discover/InlineError";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui";
import { CREATOR_CARD_SELECT, type CreatorCardData } from "@/lib/catalog/queries";
import { PILLARS, type Pillar } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function parsePillar(raw: string | string[] | undefined): Pillar | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (PILLARS as string[]).includes(value ?? "") ? (value as Pillar) : undefined;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("discover");
  return { title: t("meta.personalities"), description: t("personalities.description") };
}

// Personalidades ativas (ordem editorial sort_order), com filtro por pilar na URL.
export default async function PersonalitiesPage({ searchParams }: Props) {
  const [raw, supabase, t, tp, tcat] = await Promise.all([
    searchParams,
    createClient(),
    getTranslations("discover.personalities"),
    getTranslations("common.pillars"),
    getTranslations("catalog"),
  ]);
  const pillar = parsePillar(raw.pillar);

  let query = supabase.from("creator_profiles").select(CREATOR_CARD_SELECT).eq("status", "active").order("sort_order").order("name");
  if (pillar) query = query.contains("pillars", [pillar]);
  const { data, error } = await query;
  const creators = (data ?? []) as unknown as CreatorCardData[];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        eyebrow={t("eyebrow")}
        actions={
          <Badge variant="demo" className="hidden sm:inline-flex">
            {tcat("fictional")}
          </Badge>
        }
      >
        <ChipRow label={t("filterLabel")}>
          <ChipLink href="/personalities" selected={!pillar}>
            {t("all")}
          </ChipLink>
          {PILLARS.map((p) => (
            <ChipLink key={p} href={`/personalities?pillar=${p}`} selected={pillar === p}>
              {tp(p)}
            </ChipLink>
          ))}
        </ChipRow>
      </PageHeader>

      {error ? (
        <InlineError />
      ) : creators.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<Users />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              pillar ? (
                <Button asChild variant="secondary">
                  <Link href="/personalities">{t("all")}</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <p className="type-caption text-fg-muted" aria-live="polite">
            {t("count", { count: creators.length })}
          </p>
          <ul className={CARD_GRID}>
            {creators.map((creator, index) => (
              <li key={creator.id}>
                <CreatorCard creator={creator} priority={index < 2} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
