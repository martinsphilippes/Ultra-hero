import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { HeroProfileForm, ManageHeroButton } from "@/components/agency/HeroForms";
import { Avatar, EmptyState, PageHeader, Section } from "@/components/ui";
import { requireAgency } from "@/lib/agency/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.heroes");
  return { title: t("title") };
}

// Heróis da agência (0070): os perfis públicos que ela gerencia e publica. Gestor+ cria e abre cada um;
// os contratos de imagem ficam com a agência (Termos do Parceiro).
export default async function AgencyHeroesPage() {
  const ctx = await requireAgency("manager");
  const [t, supabase] = await Promise.all([getTranslations("agency.heroes"), createClient()]);
  const { data } = await supabase
    .from("talent_profiles")
    .select("id, creator:creator_profiles(id, slug, name, headline, avatar_url, status)")
    .eq("agency_id", ctx.agency.id)
    .not("creator_id", "is", null)
    .is("archived_at", null)
    .order("display_name");
  const heroes = (data ?? []).flatMap((row) => (row.creator ? [row.creator] : []));
  const locked = ctx.agency.isDemo;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Section title={t("listTitle", { count: heroes.length })}>
        {heroes.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState title={t("empty")} description={t("emptyHint")} />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="agency-heroes">
            {heroes.map((hero) => (
              <li key={hero.id} className="flex items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar src={hero.avatar_url} name={hero.name} size="sm" alt="" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold text-fg">{hero.name}</span>
                    <Link href={`/personalities/${hero.slug}`} className="truncate type-caption text-fg-muted underline-offset-2 hover:underline">
                      /personalities/{hero.slug}
                    </Link>
                  </div>
                </div>
                {hero.status === "active" ? <ManageHeroButton heroId={hero.id} label={t("manage")} /> : <span className="type-caption text-fg-muted">{t("suspended")}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {locked ? (
        <p className="rounded-xl border border-dashed border-border-strong p-3 type-body-sm text-fg-muted">{t("demoLocked")}</p>
      ) : (
        <Section title={t("createTitle")} description={t("createHint")}>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <HeroProfileForm />
          </div>
        </Section>
      )}
    </div>
  );
}
