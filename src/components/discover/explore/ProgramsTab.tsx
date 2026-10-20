import { Layers } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ProgramCard } from "@/components/catalog";
import { Button, EmptyState } from "@/components/ui";
import { PROGRAM_CARD_SELECT, type ProgramCardData } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";
import { CARD_GRID } from "../grid";
import { InlineError } from "../InlineError";
import { PillarChips } from "./Filters";
import { exploreHref, type ExploreParams } from "./params";

// Biblioteca de programas publicados, com filtro por pilar na URL.
export async function ProgramsTab({ params }: { params: ExploreParams }) {
  const [supabase, t] = await Promise.all([createClient(), getTranslations("discover.explore.programs")]);
  let query = supabase
    .from("programs")
    .select(PROGRAM_CARD_SELECT)
    .eq("status", "published")
    .order("is_featured", { ascending: false })
    .order("featured_rank", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(48);
  if (params.pillar) query = query.eq("pillar", params.pillar);
  const { data, error } = await query;

  // Programa sem versão publicada visível não tem título: fica de fora.
  const programs = ((data ?? []) as unknown as ProgramCardData[]).filter((program) => program.version);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="type-h3 text-fg">{t("title")}</h2>
        <p className="type-body-sm text-fg-muted">{t("description")}</p>
      </div>
      <PillarChips params={params} tab="programas" />

      {error ? (
        <InlineError />
      ) : programs.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<Layers />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              params.pillar ? (
                <Button asChild variant="secondary">
                  <Link href={exploreHref(params, { tab: "programas", pillar: null })}>{t("seeAll")}</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <p className="type-caption text-fg-muted">{t("count", { count: programs.length })}</p>
          <div className={CARD_GRID}>
            {programs.map((program, index) => (
              <ProgramCard key={program.id} program={program} priority={index === 0} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
