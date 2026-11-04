import type { Metadata } from "next";
import { ArrowRight, Briefcase, FilePlus2, FileText, SquarePlus, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { HeroWorkShortcuts } from "@/components/hero-work/HeroWorkShortcuts";
import { EmptyState, PageHeader } from "@/components/ui";
import { getRoles, hasRole } from "@/lib/auth/session";
import { hasHeroRole } from "@/lib/auth/talent-scope";
import { heroSelectable } from "@/lib/creator-content/rules";
import { loadHeroShortcutData } from "@/lib/hero-work/summary";
import { getTalentContext } from "@/lib/talent/server";
import { chosenHeroId, getMyCreator, listMyHeroesAll } from "./_lib/creator";
import { AdminHeroDashboard } from "./_components/AdminHeroDashboard";
import { AgencyHeader } from "./_components/AgencyHeader";
import { AgencyHome } from "./_components/AgencyHome";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.creator")} · ${t("creator.home")}` };
}

const QUICK =
  "flex min-h-14 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Início do Portal do Herói (0097). Herói com página: atalhos de conteúdo e, sem agência, a agenda e o financeiro
// próprios (0094). Num casting: o "Hoje" e os cartões da agência (oportunidades, tarefas, entregas, ganhos…). O admin
// vê o painel do herói escolhido em "Publicar como hero".
export default async function HeroPortalHome() {
  if (await hasRole("admin")) return <AdminHeroDashboard />;
  const [t, tn, roles, talent] = await Promise.all([getTranslations("creator.home"), getTranslations("nav.creator"), getRoles(), getTalentContext()]);
  const hero = hasHeroRole(roles);
  const casting = talent.state === "ok";
  if (!hero && !casting) {
    const tt = await getTranslations("talent.home");
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid={talent.state === "unavailable" ? "module-unavailable" : "office-none"}>
        <EmptyState icon={<Briefcase />} title={talent.state === "unavailable" ? tt("unavailable") : tt("none")} description={talent.state === "unavailable" ? undefined : tt("noneHint")} />
      </div>
    );
  }

  // herói em uso (titular ou membro): o mesmo do cartão "Você trabalha para" do Perfil
  let heroName: string | null = null;
  let hasHeroPage = false;
  let work = null;
  if (hero) {
    const [mine, heroes] = await Promise.all([getMyCreator(), listMyHeroesAll()]);
    const selectable = heroes.filter((h) => heroSelectable(h.status));
    const chosen = selectable.length > 1 ? await chosenHeroId(selectable, mine.creatorId) : (selectable[0]?.id ?? null);
    const inUse = selectable.find((h) => h.id === chosen) ?? selectable[0] ?? null;
    heroName = inUse?.name ?? mine.profile?.name ?? null;
    hasHeroPage = heroName !== null;
    // com agência, a agenda e os ganhos aparecem nos cartões da agência logo abaixo
    if (inUse && !casting) work = await loadHeroShortcutData(inUse, null);
  }

  const quick = [
    { key: "post", href: "/heroi/post/novo", icon: SquarePlus },
    { key: "newContent", href: "/heroi/conteudos/novo", icon: FilePlus2 },
    { key: "content", href: "/heroi/conteudos", icon: FileText },
    { key: "team", href: "/heroi/equipe", icon: Users },
  ] as const;

  return (
    <div className="flex flex-col gap-5" data-testid="hero-portal-home">
      {casting ? <AgencyHeader talent={talent.talent} /> : <PageHeader eyebrow={t("eyebrow")} title={heroName ?? t("title")} description={t("intro")} />}
      {hero && !hasHeroPage ? (
        // sem herói ainda (ex.: convite aceito sem herói): o herói nasce na Equipe do portal, pendente de aprovação
        <Link href="/heroi/equipe" className={QUICK} data-testid="hero-portal-create">
          <Users className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span>{t("createTitle")}</span>
            <span className="type-caption font-normal text-fg-muted">{t("createHint")}</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
        </Link>
      ) : null}
      {hero && hasHeroPage ? (
        <section aria-labelledby="hero-quick" className="flex flex-col gap-3">
          <h2 id="hero-quick" className="sr-only">
            {t("quickTitle")}
          </h2>
          <ul className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            {quick.map(({ key, href, icon: Icon }) => (
              <li key={key}>
                <Link href={href} className={QUICK}>
                  <Icon className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
                  <span className="min-w-0 flex-1 leading-tight">{tn(key)}</span>
                  <ArrowRight className="hidden size-4 shrink-0 text-fg-muted sm:block" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {work ? <HeroWorkShortcuts data={work} /> : null}
      {casting ? <AgencyHome /> : null}
    </div>
  );
}
