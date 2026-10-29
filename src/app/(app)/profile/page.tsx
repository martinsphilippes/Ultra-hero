import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Bell, BellRing, ChefHat, ChevronRight, CreditCard, Flame, Heart, LogOut, Package, Shield, ShieldCheck, ShoppingBasket, Sparkles, Store, type LucideIcon } from "lucide-react";
import { getMyCreator } from "@/app/creator/_lib/creator";
import { heroProfileFor } from "@/components/creator/hero-access";
import { ACCOUNT_ANCHOR, HeroEditorDisclosure } from "@/components/creator/HeroEditorDisclosure";
import { HeroProfileEditor, HeroProfileHeader } from "@/components/creator/HeroProfileTop";
import { HeroQuickActions } from "@/components/creator/HeroQuickActions";
import { isValidTimeZone, localDateIn } from "@/components/me/dates";
import { ProfileDataForm } from "@/components/me/ProfileDataForm";
import { parseSubscription } from "@/components/me/subscription";
import { ContinuePrograms } from "@/components/me/today/ContinuePrograms";
import { TodaySection } from "@/components/me/today/TodaySection";
import { Avatar, Badge, Button, DemoBadge, PageHeader } from "@/components/ui";
import { isLocale, type Locale } from "@/i18n/config";
import { getProfile, getRoles, requireUser, type AppRole } from "@/lib/auth/session";
import { getAvatarPhotoState } from "@/lib/avatar/availability";
import { getHeroCoverState } from "@/lib/hero-cover/availability";
import { appliesOn } from "@/lib/routine/reminders";
import { pickProgramSuggestions, type EnrollmentLike } from "@/lib/routine/today";
import { createClient } from "@/lib/supabase/server";
import { resolveTheme } from "@/lib/theme/constants";
import { resolveTodayView } from "@/lib/health/view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("profile") };
}

// Perfil: o topo segue o Instagram para todas as contas. Cabeçalho (foto e nome; o herói mostra o
// perfil público com selo e bio recolhida; as outras contas, e-mail, papéis e plano), Portais logo
// abaixo e um só "Editar perfil", com o editor recolhido na mesma tela: perfil público do herói (antes
// em /creator/profile) e "Sua conta" (nome exibido, foto, idioma e tema; antes a seção Dados). Depois:
// "Hoje" (só o que o relógio mede), Evolução, "Continue seus programas", Lembretes (fora do Hoje, Q5),
// atalhos e, no fim, "Sair da conta".

// Inscrição ativa com os itens do programa (program_items + conteúdo + herói) para as sugestões do dia.
type EnrollmentWithItems = {
  id: string;
  status: "active" | "completed" | "abandoned";
  program: { slug: string } | null;
  version: {
    title: string;
    items: { position: number; is_required: boolean; content: { id: string; slug: string; title: string; cover_url: string | null; creator: { name: string } | null } | null }[];
  } | null;
};

const ENROLLMENT_SELECT =
  "id, status, program:programs(slug), version:program_versions(title, items:program_items(position, is_required, content:content(id, slug, title, cover_url, creator:creator_profiles(name))))";

// Ordem de exibição: o portal do herói primeiro (é a área de trabalho principal de quem publica).
const PORTALS: Array<{ role: Exclude<AppRole, "consumer">; href: string; icon: LucideIcon }> = [
  { role: "creator", href: "/creator", icon: Sparkles },
  { role: "seller", href: "/seller", icon: Store },
  { role: "admin", href: "/admin", icon: ShieldCheck },
];

const LINKS: Array<{ key: "plan" | "interests" | "favorites" | "recipes" | "shoppingList" | "orders" | "notifications" | "account"; href: string; icon: LucideIcon }> = [
  { key: "plan", href: "/profile/plan", icon: CreditCard },
  { key: "interests", href: "/profile/interests", icon: Sparkles },
  { key: "favorites", href: "/profile/favorites", icon: Heart },
  { key: "recipes", href: "/profile/receitas", icon: ChefHat },
  { key: "shoppingList", href: "/profile/lista-de-compras", icon: ShoppingBasket },
  { key: "orders", href: "/orders", icon: Package },
  { key: "notifications", href: "/profile/notifications", icon: Bell },
  { key: "account", href: "/profile/account", icon: Shield },
];

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
  // só com o papel de herói (ou admin), como no portal: a linha em creator_profiles sozinha não basta
  const heroProfile = heroProfileFor(
    roles.map((r) => r.role),
    creator.profile,
  );
  // envio de capa (0042): só o herói vê; sem a 0042 ou sem service role fica "indisponível"
  const coverState = heroProfile ? await getHeroCoverState() : null;
  const supabase = await createClient();
  const tz = isValidTimeZone(profile?.timezone) ? profile.timezone : "UTC";
  const today = localDateIn(tz);
  const [{ data: subscriptionRaw }, enrollmentsRes, completionsRes, streakRes, remindersRes] = await Promise.all([
    supabase.rpc("my_subscription"),
    supabase.from("enrollments").select(ENROLLMENT_SELECT).eq("user_id", user.id).eq("status", "active").order("enrolled_at", { ascending: false }),
    supabase.from("completions").select("content_id").eq("user_id", user.id).limit(2000),
    supabase.rpc("compute_streak", { p_user: user.id, p_timezone: tz }),
    // Só para o resumo do atalho de Lembretes; a lista mora em /profile/lembretes.
    supabase.from("routine_items").select("weekdays, active").eq("user_id", user.id).eq("active", true),
  ]);
  // Resumo da Evolução (a página completa fica em /profile/evolution).
  const currentStreak = Number(streakRes.data ?? 0);
  const completionsCount = (completionsRes.data ?? []).length;
  const subscription = parseSubscription(subscriptionRaw);

  // Itens de rotina criados à mão viraram Lembretes (Q5), fora do Hoje; a sequência conta só
  // conteúdos (Q10, 0037). Se a leitura falhar, o atalho aparece sem a contagem.
  const reminders = remindersRes.error ? null : (remindersRes.data ?? []);
  const remindersToday = reminders ? reminders.filter((r) => appliesOn(r, today)).length : null;
  // Programas: próximos passos.
  const enrollments: EnrollmentLike[] = ((enrollmentsRes.data ?? []) as unknown as EnrollmentWithItems[]).map((e) => ({
    id: e.id,
    status: e.status,
    programName: e.version?.title ?? "",
    programSlug: e.program?.slug ?? "",
    items: (e.version?.items ?? []).map((i) => ({
      position: i.position,
      is_required: i.is_required,
      content: i.content ? { id: i.content.id, slug: i.content.slug, title: i.content.title, cover_url: i.content.cover_url, creatorName: i.content.creator?.name ?? null } : null,
    })),
  }));
  const suggestions = pickProgramSuggestions(enrollments, (completionsRes.data ?? []).map((c) => c.content_id));

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const displayName = profile?.display_name || (typeof meta?.full_name === "string" ? meta.full_name : null) || user.email?.split("@")[0] || "";
  const roleSet = Array.from(new Set(roles.map((r) => r.role)));
  // Relógio simulado só para contas demo (marcador do servidor); contas reais veem "Conectar relógio"
  // ou, com WEARABLES_REAL_ENABLED=1, o relógio que conectaram.
  const watchView = await resolveTodayView({ user, roles: roleSet, timeZone: tz, example: false });
  const portals = PORTALS.filter((p) => roleSet.includes(p.role));
  const uiLocale: Locale = isLocale(profile?.locale) ? profile.locale : (locale as Locale);
  const theme = resolveTheme(profile?.theme);
  const planKey = subscription.status === "anonymous" ? "unknown" : subscription.status;
  // perfil ativo e vinculado (my_creator_id): só aí o editor do herói grava, e o avatar é um só
  const heroActive = heroProfile !== null && creator.creatorId !== null;
  // herói ativo já tem o portal inteiro nos atalhos (Painel, Novo post…): o cartão "Portal do herói" sai
  const visiblePortals = heroActive ? portals.filter((p) => p.role !== "creator") : portals;

  const portalsNav = visiblePortals.length > 0 ? (
    <nav aria-label={t("portals.title")} data-testid="profile-portals">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visiblePortals.map(({ role, href, icon: Icon }) => (
          <li key={role}>
            <Link
              href={href}
              data-testid={`profile-portal-${role}`}
              className="flex min-h-16 items-center gap-3 rounded-2xl border border-accent/30 bg-surface px-4 py-3 shadow-sm transition-[border-color,box-shadow] hover:border-accent/60 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:px-5"
            >
              <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
                <Icon className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold text-fg">{t(`portals.${role}`)}</span>
                <span className="type-caption text-fg-muted">{t(`portals.hints.${role}`)}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  ) : null;

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
        {roleSet.map((role) => (
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

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} actions={<DemoBadge />} />

      {heroProfile ? (
        // topo do herói: cabeçalho público → atalhos do portal → outros portais (fornecedor/admin) → Editar perfil
        <div className="flex flex-col gap-4">
          <HeroProfileHeader profile={heroProfile} />
          {/* atalhos do portal (novo post, conteúdos, receitas, vínculos, painel) perto de "Editar perfil" */}
          {heroActive ? <HeroQuickActions /> : null}
          {portalsNav}
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
        // topo das outras contas: foto, nome, e-mail, papéis e plano → Portais (se houver) → Editar perfil
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
          {portalsNav}
          <HeroEditorDisclosure publicHref={null} description={t("editor.description")}>
            <div id={ACCOUNT_ANCHOR} className="scroll-mt-20">
              {dataForm}
            </div>
          </HeroEditorDisclosure>
        </div>
      )}

      {/* Hoje: só o que o relógio mede (nada digitado); dado real só com a chave ligada e consentimento */}
      <TodaySection localDate={today} view={watchView} />

      {/* Evolução: resumo; a página completa virou subpágina do Perfil */}
      <section aria-labelledby="evolution-title" className="flex flex-col gap-4 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft/60 to-surface p-5 sm:flex-row sm:items-center" data-testid="profile-evolution">
        <div className="flex flex-1 items-center gap-4">
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-sm">
            <Flame className="size-6" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="evolution-title" className="type-h3 text-fg">
              {t("evolution.title")}
            </h2>
            <p className="type-overline text-accent-text">{t("evolution.streakLabel")}</p>
            <p className="type-h2 type-numeric text-fg">{t("evolution.streakDays", { n: currentStreak })}</p>
            <p className="type-caption text-fg-muted">{t("evolution.completions", { n: completionsCount })}</p>
          </div>
        </div>
        <Button asChild variant="secondary" trailingIcon={<ChevronRight />}>
          <Link href="/profile/evolution">{t("evolution.open")}</Link>
        </Button>
      </section>

      {/* Continue seus programas: as sugestões dos programas que antes ficavam no Hoje */}
      <ContinuePrograms suggestions={suggestions} />

      {/* Lembretes: itens de rotina da pessoa, fora do Hoje (Q5); o Hoje não tem link para criá-los */}
      <Link
        href="/profile/lembretes"
        data-testid="profile-reminders"
        className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-[border-color,box-shadow] hover:border-accent/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:px-5"
      >
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-accent-text">
          <BellRing className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold text-fg">{t("reminders.title")}</span>
          <span className="type-caption text-fg-muted">
            {reminders && reminders.length > 0 ? `${t("reminders.today", { n: remindersToday ?? 0 })} · ${t("reminders.total", { n: reminders.length })}` : t("reminders.description")}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
      </Link>

      {/* Atalhos */}
      <nav aria-label={t("title")}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {LINKS.map(({ key, href, icon: Icon }) => (
            <li key={key}>
              <Link
                href={href}
                className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-[border-color,box-shadow] hover:border-accent/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-accent-text">
                  <Icon className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold text-fg">{t(`links.${key}.title`)}</span>
                  <span className="type-caption text-fg-muted">{t(`links.${key}.description`)}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Sair da conta: no fim, como no Instagram */}
      <div className="flex flex-col items-start gap-2">
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="secondary" leadingIcon={<LogOut />}>
            {t("signOut")}
          </Button>
        </form>
        <p className="type-caption text-fg-muted">{t("demoNote")}</p>
      </div>
    </div>
  );
}
