import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AccessPanel } from "@/components/agency/AccessPanel";
import { ManageHeroButton } from "@/components/agency/HeroForms";
import { AgencyInviteDialog, type HeroInviteTalent } from "@/components/invites/AgencyInviteDialog";
import { ImageAuthorizationNotice } from "@/components/catalog/ImageAuthorizationNotice";
import { Avatar, Button, EmptyState, PageHeader, Section } from "@/components/ui";
import { loadAccessStatus } from "@/lib/agency/access-status";
import { needsImageAuthorization } from "@/lib/catalog/rights";
import { requireAgency } from "@/lib/agency/server";
import { createClient } from "@/lib/supabase/server";
import { InvitesGate } from "@/components/invites/InvitesGate";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.heroes");
  return { title: t("title") };
}

// Heros da agência (0070): os perfis públicos que ela gerencia e publica. Gestor+ abre cada um; os contratos de
// imagem ficam com a agência (Termos do Parceiro). 0112: o Hero nasce só pelo Casting ("Novo Hero": a pessoa, o
// acesso e a página opcional); aqui fica a lista, a situação do acesso, a edição da página e o publicar em nome dele.
export default async function AgencyHeroesPage() {
  const ctx = await requireAgency("manager");
  const [t, supabase] = await Promise.all([getTranslations("agency.heroes"), createClient()]);
  const { data } = await supabase
    .from("talent_profiles")
    .select("id, consent_at, consent_revoked_at, creator:creator_profiles(id, slug, name, headline, avatar_url, status, is_fictional, rights_status, rights_valid_until)")
    .eq("agency_id", ctx.agency.id)
    .not("creator_id", "is", null)
    .is("archived_at", null)
    .order("display_name");
  // pessoa real sem autorização de imagem válida: aviso interno com o atalho para o consentimento na ficha
  const heroes = (data ?? []).flatMap((row) =>
    row.creator ? [{ ...row.creator, talentId: row.id, needsRights: needsImageAuthorization(row.creator), consentOk: Boolean(row.consent_at && !row.consent_revoked_at) }] : [],
  );
  // 0091: convite de Hero — creators do casting sem login (o selo do acesso diz quem já tem conta)
  const [{ data: casting }, { data: access }, ti, accounts] = await Promise.all([
    supabase.from("talent_profiles").select("id, display_name, creator_id, creator:creator_profiles(name)").eq("agency_id", ctx.agency.id).is("archived_at", null).order("display_name"),
    supabase.rpc("agency_talent_access", { p_agency: ctx.agency.id }),
    getTranslations("invites.agency"),
    // 0112: situação do acesso de cada Hero (e-mail e celular só para gestor+)
    loadAccessStatus(supabase, ctx.agency.id, "talent"),
  ]);
  const withLogin = new Set((access ?? []).filter((a) => a.access === "login").map((a) => a.talent_id));
  const inviteTalents: HeroInviteTalent[] = (casting ?? [])
    .filter((x) => !withLogin.has(x.id))
    .map((x) => ({ id: x.id, name: x.display_name, hasHero: x.creator_id !== null, heroName: (x.creator as { name: string } | null)?.name ?? null }));
  const locked = ctx.agency.isDemo;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          locked ? null : (
            <div className="flex flex-wrap gap-2">
              {/* 0112: um só "Novo Hero", pelo Casting (a pessoa + acesso + página opcional) */}
              <Button asChild size="sm" leadingIcon={<Plus />}>
                <Link href="/agencia/casting/novo" data-testid="heroes-new">
                  {t("newHero")}
                </Link>
              </Button>
              <InvitesGate>
                <AgencyInviteDialog mode="hero" talents={inviteTalents} />
              </InvitesGate>
            </div>
          )
        }
      />
      <Section title={t("listTitle", { count: heroes.length })}>
        {heroes.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState title={t("empty")} description={t("emptyHint")} />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="agency-heroes">
            {heroes.map((hero) => {
              const account = accounts.get(hero.talentId);
              return (
                <li key={hero.id} className="flex flex-col gap-3 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar src={hero.avatar_url} name={hero.name} size="sm" alt="" />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold text-fg">{hero.name}</span>
                        <Link href={`/personalities/${hero.slug}`} className="truncate type-caption text-fg-muted underline-offset-2 hover:underline">
                          /personalities/{hero.slug}
                        </Link>
                        <Link href={`/agencia/casting/${hero.talentId}`} className="truncate type-caption text-accent-text underline-offset-2 hover:underline">
                          {t("castingRecord")}
                        </Link>
                      </div>
                    </div>
                    {hero.status === "active" ? (
                      <ManageHeroButton heroId={hero.id} label={t("manage")} />
                    ) : (
                      <span className="type-caption text-fg-muted">{hero.status === "pending" ? ti("heroPending") : t("suspended")}</span>
                    )}
                  </div>
                  {hero.needsRights ? <ImageAuthorizationNotice audience="agency" href={`/agencia/casting/${hero.talentId}#talent-consent`} awaiting={hero.consentOk} compact /> : null}
                  {account && !locked ? <AccessPanel kind="talent" targetId={hero.talentId} status={account} compact /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      {locked ? <p className="rounded-xl border border-dashed border-border-strong p-3 type-body-sm text-fg-muted">{t("demoLocked")}</p> : null}
    </div>
  );
}
