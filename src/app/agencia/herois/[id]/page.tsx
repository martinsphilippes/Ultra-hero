import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessPanel } from "@/components/agency/AccessPanel";
import { HeroMediaPanel } from "@/components/agency/HeroMediaPanel";
import { HeroProfileForm } from "@/components/agency/HeroForms";
import { Button, PageHeader, Section } from "@/components/ui";
import { actingClient, getActingHero } from "@/lib/acting-hero/server";
import { loadAccessStatus } from "@/lib/agency/access-status";
import { requireAgency } from "@/lib/agency/server";
import { getAvatarPhotoState } from "@/lib/avatar/availability";
import { getHeroCoverState } from "@/lib/hero-cover/availability";
import type { Pillar } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.heroes");
  return { title: t("title") };
}

// Gestão de um herói pela agência (0070): só o herói escolhido (o banco confere o vínculo a cada chamada).
// Perfil, foto, capa e o Novo post em nome dele.
export default async function AgencyHeroPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAgency("manager");
  const { id } = await params;
  const acting = await getActingHero();
  if (acting.status !== "ok" || acting.hero.id !== id) redirect("/agencia/herois");
  const [t, supabase, avatarState, coverState] = await Promise.all([getTranslations("agency.heroes"), actingClient(id), getAvatarPhotoState(), getHeroCoverState()]);
  const { data: hero } = await supabase.from("creator_profiles").select("id, slug, name, headline, bio, pillars, avatar_url, cover_url").eq("id", id).maybeSingle();
  if (!hero) redirect("/agencia/herois");
  // 0112: acesso do herói (pela ficha do casting ligada; só gestor+ e admin geral)
  const own = await createClient();
  const { data: talentRow } = await own.from("talent_profiles").select("id").eq("creator_id", id).eq("agency_id", ctx.agency.id).is("archived_at", null).maybeSingle();
  const account = talentRow ? ((await loadAccessStatus(own, ctx.agency.id, "talent")).get(talentRow.id) ?? null) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={hero.name}
        description={t("heroDescription")}
        backHref="/agencia/herois"
        backLabel={t("title")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/agencia/herois/${id}/post`}>{t("newPost")}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/personalities/${hero.slug}`}>{t("viewPage")}</Link>
            </Button>
          </div>
        }
      />
      {account && talentRow && !ctx.agency.isDemo ? (
        <Section title={t("accountTitle")} description={t("accountDescription")}>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <AccessPanel kind="talent" targetId={talentRow.id} status={account} />
          </div>
        </Section>
      ) : null}
      <Section title={t("mediaTitle")}>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <HeroMediaPanel name={hero.name} avatarUrl={hero.avatar_url} coverUrl={hero.cover_url} avatarState={avatarState} coverState={coverState} avatarHint={t("avatarHint")} />
        </div>
      </Section>
      <Section title={t("profileTitle")}>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <HeroProfileForm heroId={id} initial={{ name: hero.name, pillars: (hero.pillars ?? []) as Pillar[], headline: hero.headline ?? "", bio: hero.bio ?? "" }} />
        </div>
      </Section>
    </div>
  );
}
