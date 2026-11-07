import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { heroPickerHref } from "@/lib/acting-hero/constants";
import { createClient } from "@/lib/supabase/server";
import { chosenHeroId, getMyCreator, listMyHeroesAll } from "@/app/heroi/_lib/creator";
import { MyHeroesCard } from "@/components/creator/MyHeroesCard";
import { heroSelectable } from "@/lib/creator-content/rules";
import { heroProfileFor } from "@/components/creator/hero-access";
import { HeroEditorDisclosure } from "@/components/creator/HeroEditorDisclosure";
import { ACCOUNT_ANCHOR } from "@/lib/creator/hero-anchors";
import { HeroProfileEditor, HeroProfileHeader } from "@/components/creator/HeroProfileTop";
import { HeroNewPost } from "@/components/creator/HeroNewPost";
import { HeroWorkShortcuts } from "@/components/hero-work/HeroWorkShortcuts";
import { loadHeroShortcutData } from "@/lib/hero-work/summary";
import { HeroPendingNotice } from "@/components/creator/HeroPendingNotice";
import { HeroSegmentsForm } from "@/components/team/HeroSegmentsForm";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { isValidTimeZone, localDateIn } from "@/components/me/dates";
import { ProfileDataForm } from "@/components/me/ProfileDataForm";
import { TodaySection } from "@/components/me/today/TodaySection";
import { Avatar, Badge, PageHeader } from "@/components/ui";
import { isLocale, type Locale } from "@/i18n/config";
import { getProfile, getRoles, isTalentOnly, requireUser } from "@/lib/auth/session";
import { heroRoleNames } from "@/lib/auth/talent-scope";
import { getTalentContext } from "@/lib/talent/server";
import { getAvatarPhotoState } from "@/lib/avatar/availability";
import { getHeroCoverState } from "@/lib/hero-cover/availability";
import { loadEvolutionSummary } from "@/lib/routine/evolution-summary";
import { resolveTheme } from "@/lib/theme/constants";
import { resolveTodayView } from "@/lib/health/view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("profile") };
}

// Perfil: no alto, "Seus portais" (agência, marca, admin, profissional e o Escritório do casting; pedido
// do responsável: a entrada no painel fica bem em cima). Depois, o topo segue o Instagram para todas as
// contas. Cabeçalho (foto e nome; o Hero mostra o
// perfil público com selo e bio recolhida e o Novo post; as outras contas, e-mail e papéis) e um
// só "Editar perfil", com o editor recolhido na mesma tela: perfil público do Hero (antes em
// /heroi/pagina) e "Sua conta" (nome exibido, foto, idioma e tema). Depois, "Hoje" em 3 cards (Seu
// dia, Sua noite e Evolução) e, no fim, uma linha "Configurações". Lembretes, coleções, compras, conta,
// os mesmos portais e Sair moram em /configuracoes, que também abre pelo avatar do topo.

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const [profile, roles, locale, t, tc, tcp, photoState, creator] = await Promise.all([
    getProfile(),
    getRoles(),
    getLocale(),
    getTranslations("me.profile"),
    getTranslations("common"),
    getTranslations("creator.profile"),
    getAvatarPhotoState(),
    getMyCreator(),
  ]);
  const [tinv, tonb, onboarding] = await Promise.all([
    getTranslations("invites.team"),
    getTranslations("invites.onboarding"),
    // 0091: passo a passo do primeiro acesso ainda aberto (empresa a criar); sem a migração, nada
    createClient().then((c) => c.rpc("onboarding_pending")),
  ]);
  const onboardingOpen = Array.isArray(onboarding.data) && onboarding.data.length > 0;
  // só com o papel de Hero (ou admin), como no portal: a linha em creator_profiles sozinha não basta
  const heroProfile = heroProfileFor(heroRoleNames(roles), creator.profile);
  // envio de capa (0042): só o Hero vê; sem a 0042 ou sem service role fica "indisponível"
  const coverState = heroProfile ? await getHeroCoverState() : null;
  const tz = isValidTimeZone(profile?.timezone) ? profile.timezone : "UTC";
  const today = localDateIn(tz);
  // Evolução (sequência, conteúdos concluídos e próximos passos dos programas): card do Hoje
  const evolution = await loadEvolutionSummary(user.id, tz);

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const displayName = profile?.display_name || (typeof meta?.full_name === "string" ? meta.full_name : null) || user.email?.split("@")[0] || "";
  const roleSet = Array.from(new Set(roles.map((r) => r.role)));
  // talento sem página (só escopo talent, D2): o selo diz "Creator" (nomenclatura única da gestão; "Hero" só para a página pública); quem está num casting tem o Escritório
  // (nos portais do topo)
  const roleBadges = isTalentOnly(roles) ? roleSet.map((r) => (r === "creator" ? "talent" : r)) : roleSet;
  const talentCtx = roleSet.includes("creator") ? await getTalentContext() : null;
  // "Você trabalha para" (0092): Heros da pessoa (titular/equipe) e o em uso para postar e criar conteúdo
  const myHeroes = heroProfile ? await listMyHeroesAll() : [];
  const heroInUse = myHeroes.length > 1 ? await chosenHeroId(myHeroes.filter((h) => heroSelectable(h.status)), creator.creatorId) : (creator.creatorId ?? myHeroes[0]?.id ?? null);
  // Atalhos Agenda e Financeiro do Hero em uso (0094) e o mini-resumo: próximo compromisso e "a receber este mês"
  const heroForWork = heroProfile && creator.creatorId ? (myHeroes.find((h) => h.id === heroInUse && heroSelectable(h.status)) ?? null) : null;
  const heroWork = heroForWork ? await loadHeroShortcutData(heroForWork, talentCtx?.state === "ok" ? { talentId: talentCtx.talent.id, creatorId: talentCtx.talent.creatorId } : null) : null;
  // "Conectar relógio" ou, com WEARABLES_REAL_ENABLED=1, o relógio que a pessoa conectou.
  const watchView = await resolveTodayView({ user, roles: roleSet, timeZone: tz, example: false });
  const uiLocale: Locale = isLocale(profile?.locale) ? profile.locale : (locale as Locale);
  const theme = resolveTheme(profile?.theme);
  // perfil ativo e vinculado (my_creator_id): só aí o editor do Hero grava, e o avatar é um só
  const heroActive = heroProfile !== null && creator.creatorId !== null;
  // 0091: membro da equipe do Hero posta, mas perfil, foto e capa ficam com o titular
  const heroOwner = heroActive && creator.teamRole !== "member";
  // 0125: segmentos do Calendário Groscove (até 4) e nível do Hero — o titular escolhe aqui
  const [mySegments, tsg] = heroOwner
    ? await Promise.all([
        createClient().then((sb) => sb.from("creator_profiles").select("segments, level").eq("user_id", user.id).maybeSingle()),
        getTranslations("team.segments"),
      ])
    : [null, null];
  // admin com perfil de Hero posta pelo seletor de "Publicar como hero" (o mesmo fluxo dos outros Heros)
  const newPostHref = roleSet.includes("admin") ? heroPickerHref("post") : "/heroi/post/novo";
  // 0092: Novo conteúdo (estruturado) ao lado do Novo post; o admin segue pelo seletor de "Publicar como hero"
  const newContentHref = roleSet.includes("admin") ? heroPickerHref("newContent") : "/heroi/conteudos/novo";
  const myContentHref = roleSet.includes("admin") ? heroPickerHref("content") : "/heroi/conteudos";

  const dataForm = (
    <ProfileDataForm
      displayName={displayName}
      avatarUrl={profile?.avatar_url ?? null}
      locale={uiLocale}
      theme={theme}
      photoState={photoState}
      photoHint={heroProfile ? tcp("photoHint") : undefined}
      // Hero ativo: um avatar só, no perfil público do mesmo editor; inativo ou não Hero: o avatar fica aqui
      avatarInHeroEditor={heroOwner}
    />
  );
  // e-mail e papéis: no cabeçalho de quem não é Hero; dentro de "Sua conta" para o Hero
  const accountSummary = (
    <div className="flex min-w-0 flex-col gap-2" data-testid="profile-account-summary">
      <p className="type-body-sm truncate text-fg-muted">
        <span className="sr-only">{t("emailLabel")}: </span>
        {user.email}
      </p>
      <ul className="flex flex-wrap items-center gap-1.5" aria-label={t("roles.label")}>
        {roleBadges.map((role) => (
          <li key={role}>
            <Badge variant={role === "admin" ? "accent" : "neutral"}>{t(`roles.${role}`)}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} />

      {onboardingOpen ? (
        <Link href="/primeiro-acesso" className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-semibold text-fg" data-testid="onboarding-banner">
          {tonb("banner")}
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}

      {heroProfile ? (
        // topo do Hero: cabeçalho público → Novo post e Novo conteúdo → Editar perfil
        <div className="flex flex-col gap-4">
          <HeroProfileHeader profile={heroProfile} />
          {heroActive && heroProfile.status === "pending" ? <HeroPendingNotice /> : null}
          <MyHeroesCard
            heroes={myHeroes}
            currentId={heroInUse}
            agency={talentCtx?.state === "ok" && creator.creatorId ? { heroId: creator.creatorId, name: talentCtx.talent.agency } : null}
          />
          {/* Novo post (rápido) e Novo conteúdo (estruturado, 0092) para o titular e a equipe do Hero */}
          {heroActive ? <HeroNewPost href={newPostHref} contentHref={newContentHref} listHref={myContentHref} /> : null}
          {/* 0094: Agenda e Financeiro do Hero em uso, com o próximo compromisso e "a receber este mês" */}
          {heroActive && heroWork ? <HeroWorkShortcuts data={heroWork} /> : null}
          {heroOwner && tsg ? (
            <section aria-labelledby="hero-segments-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5" data-testid="hero-segments">
              <div className="flex flex-col gap-0.5">
                <h2 id="hero-segments-title" className="text-base font-semibold text-fg">
                  {tsg("sectionTitle")}
                </h2>
                <p className="type-body-sm text-fg-muted">{tsg("sectionHint")}</p>
              </div>
              <HeroSegmentsForm initialSegments={mySegments?.data?.segments ?? []} initialLevel={mySegments?.data?.level ?? null} />
            </section>
          ) : null}
          <HeroProfileEditor
            profile={heroProfile}
            active={heroOwner}
            readOnlyNotice={heroActive && !heroOwner ? tinv("memberProfileNotice") : undefined}
            photoState={photoState}
            coverState={coverState ?? { upload: "not_configured", canRemove: false }}
            account={
              <section id={ACCOUNT_ANCHOR} aria-labelledby="account-title" className="flex scroll-mt-20 flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                <div className="flex flex-col gap-0.5">
                  <h3 id="account-title" className="text-base font-semibold text-fg">
                    {t("account.title")}
                  </h3>
                  <p className="type-body-sm text-fg-muted">{t("account.description")}</p>
                </div>
                {accountSummary}
                {dataForm}
              </section>
            }
          />
        </div>
      ) : (
        // topo das outras contas: foto, nome, e-mail e papéis → Editar perfil
        <div className="flex flex-col gap-4">
          <section aria-labelledby="account-name" data-testid="profile-account" className="flex items-center gap-4">
            <Avatar src={profile?.avatar_url} name={displayName} size="xl" alt="" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <h2 id="account-name" className="type-h3 break-words text-fg">
                {displayName}
              </h2>
              {accountSummary}
            </div>
          </section>
          <HeroEditorDisclosure publicHref={null} description={t("editor.description")}>
            <div id={ACCOUNT_ANCHOR} className="scroll-mt-20">
              {dataForm}
            </div>
          </HeroEditorDisclosure>
        </div>
      )}

      {/* Hoje: só o que o relógio mede (nada digitado); dado real só com a chave ligada e consentimento */}
      <TodaySection localDate={today} view={watchView} evolution={evolution} />

      {/* Configurações ficam no cabeçalho (avatar → /configuracoes): sem atalho duplicado aqui (pedido do responsável) */}

      {/* Termos e Privacidade só aqui, não em todas as páginas (pedido do responsável) */}
      <footer className="mt-4 border-t border-border pt-4 print:hidden">
        <LegalLinks />
      </footer>
    </div>
  );
}
