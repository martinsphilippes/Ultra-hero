import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { heroPickerHref } from "@/lib/acting-hero/constants";
import { getMyCreator } from "@/app/creator/_lib/creator";
import { heroProfileFor } from "@/components/creator/hero-access";
import { ACCOUNT_ANCHOR, HeroEditorDisclosure } from "@/components/creator/HeroEditorDisclosure";
import { HeroProfileEditor, HeroProfileHeader } from "@/components/creator/HeroProfileTop";
import { HeroNewPost } from "@/components/creator/HeroNewPost";
import { isValidTimeZone, localDateIn } from "@/components/me/dates";
import { ProfileDataForm } from "@/components/me/ProfileDataForm";
import { parseSubscription } from "@/components/me/subscription";
import { TodaySection } from "@/components/me/today/TodaySection";
import { DemoAccess } from "@/components/demo/DemoAccess";
import { PortalShortcuts } from "@/components/me/PortalShortcuts";
import { Avatar, Badge, DemoBadge, PageHeader } from "@/components/ui";
import { isLocale, type Locale } from "@/i18n/config";
import { getProfile, getRoles, isTalentOnly, requireUser } from "@/lib/auth/session";
import { heroRoleNames } from "@/lib/auth/talent-scope";
import { getTalentContext } from "@/lib/talent/server";
import { getAvatarPhotoState } from "@/lib/avatar/availability";
import { getHeroCoverState } from "@/lib/hero-cover/availability";
import { loadEvolutionSummary } from "@/lib/routine/evolution-summary";
import { buildPortalItems, forSurface, isDemoUser } from "@/lib/settings/sections";
import { parseNativeApp } from "@/lib/native-app/surface";
import { createClient } from "@/lib/supabase/server";
import { resolveTheme } from "@/lib/theme/constants";
import { resolveTodayView } from "@/lib/health/view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("profile") };
}

// Perfil: no alto, "Seus portais" (agência, marca, admin, profissional e o Escritório do casting; pedido
// do responsável: a entrada no painel fica bem em cima). Depois, o topo segue o Instagram para todas as
// contas. Cabeçalho (foto e nome; o herói mostra o
// perfil público com selo e bio recolhida e o Novo post; as outras contas, e-mail, papéis e plano) e um
// só "Editar perfil", com o editor recolhido na mesma tela: perfil público do herói (antes em
// /creator/profile) e "Sua conta" (nome exibido, foto, idioma e tema). Depois, "Hoje" em 3 cards (Seu
// dia, Sua noite e Evolução) e, no fim, uma linha "Configurações". Lembretes, coleções, compras, conta,
// os mesmos portais e Sair moram em /configuracoes, que também abre pelo avatar do topo.

// Contas de demonstração: o atalho "trocar de conta" mora no fim do Perfil (saiu do Início; o responsável
// remove depois). Mesma trava de hoje: sem DEMO_ACCOUNTS_PASSWORD, ou no app das lojas, nada aparece.
type Props = { searchParams: Promise<{ demo?: string }> };

export default async function ProfilePage({ searchParams }: Props) {
  const user = await requireUser("/profile");
  const { demo } = await searchParams;
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
  // só com o papel de herói (ou admin), como no portal: a linha em creator_profiles sozinha não basta
  const heroProfile = heroProfileFor(heroRoleNames(roles), creator.profile);
  // envio de capa (0042): só o herói vê; sem a 0042 ou sem service role fica "indisponível"
  const coverState = heroProfile ? await getHeroCoverState() : null;
  const supabase = await createClient();
  const tz = isValidTimeZone(profile?.timezone) ? profile.timezone : "UTC";
  const today = localDateIn(tz);
  const [{ data: subscriptionRaw }, evolution] = await Promise.all([
    supabase.rpc("my_subscription"),
    // Evolução (sequência, conteúdos concluídos e próximos passos dos programas): card do Hoje
    loadEvolutionSummary(user.id, tz),
  ]);
  const subscription = parseSubscription(subscriptionRaw);

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const displayName = profile?.display_name || (typeof meta?.full_name === "string" ? meta.full_name : null) || user.email?.split("@")[0] || "";
  const roleSet = Array.from(new Set(roles.map((r) => r.role)));
  // talento sem página (só escopo talent, D2): o selo diz "Talento"; quem está num casting tem o Escritório
  // (nos portais do topo)
  const roleBadges = isTalentOnly(roles) ? roleSet.map((r) => (r === "creator" ? "talent" : r)) : roleSet;
  const talentCtx = roleSet.includes("creator") ? await getTalentContext() : null;
  // Relógio simulado só para contas demo (marcador do servidor); contas reais veem "Conectar relógio"
  // ou, com WEARABLES_REAL_ENABLED=1, o relógio que conectaram.
  const watchView = await resolveTodayView({ user, roles: roleSet, timeZone: tz, example: false });
  const uiLocale: Locale = isLocale(profile?.locale) ? profile.locale : (locale as Locale);
  const theme = resolveTheme(profile?.theme);
  const planKey = subscription.status === "anonymous" ? "unknown" : subscription.status;
  // perfil ativo e vinculado (my_creator_id): só aí o editor do herói grava, e o avatar é um só
  const heroActive = heroProfile !== null && creator.creatorId !== null;
  // admin com perfil de herói posta pelo seletor de "Publicar como hero" (o mesmo fluxo dos outros heróis)
  const newPostHref = roleSet.includes("admin") ? heroPickerHref("post") : "/creator/post/new";

  const dataForm = (
    <ProfileDataForm
      displayName={displayName}
      avatarUrl={profile?.avatar_url ?? null}
      locale={uiLocale}
      theme={theme}
      photoState={photoState}
      photoHint={heroProfile ? tcp("photoHint") : undefined}
      // herói ativo: um avatar só, no perfil público do mesmo editor; inativo ou não herói: o avatar fica aqui
      avatarInHeroEditor={heroActive}
    />
  );
  // e-mail, papéis e plano: no cabeçalho de quem não é herói; dentro de "Sua conta" para o herói
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
        <li>
          <Badge variant={subscription.status === "active" ? "premium" : subscription.status === "cancelled" ? "warning" : "free"}>
            <span className="sr-only">{t("plan.label")}: </span>
            {t(`plan.${planKey}`)}
          </Badge>
        </li>
      </ul>
    </div>
  );

  // portais no topo (pedido do responsável): agência, marca, admin, profissional e o Escritório do casting
  const native = parseNativeApp((await headers()).get("user-agent")) !== null;
  const portalItems = forSurface(buildPortalItems(roleSet, undefined, { hasTalent: talentCtx?.state === "ok", platformAdmin: !isDemoUser(user) }), native);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} actions={<DemoBadge />} />

      <PortalShortcuts items={portalItems} />

      {heroProfile ? (
        // topo do herói: cabeçalho público → Novo post → Editar perfil
        <div className="flex flex-col gap-4">
          <HeroProfileHeader profile={heroProfile} />
          {/* o herói só posta no dia a dia (foto ou vídeo); o resto é da administração */}
          {heroActive ? <HeroNewPost href={newPostHref} /> : null}
          <HeroProfileEditor
            profile={heroProfile}
            active={heroActive}
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
        // topo das outras contas: foto, nome, e-mail, papéis e plano → Editar perfil
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

      <DemoAccess from="profile" failed={demo === "error"} />
    </div>
  );
}
