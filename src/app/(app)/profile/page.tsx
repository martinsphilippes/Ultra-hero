import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Bell, ChefHat, ChevronRight, CreditCard, Flame, Heart, LogOut, Package, Shield, ShieldCheck, Sparkles, Store, UserCog, type LucideIcon } from "lucide-react";
import { isValidTimeZone, localDateIn } from "@/components/me/dates";
import { ProfileDataForm } from "@/components/me/ProfileDataForm";
import { parseSubscription } from "@/components/me/subscription";
import type { RhythmItem } from "@/components/me/today/RhythmBlock";
import { TodaySection } from "@/components/me/today/TodaySection";
import { Avatar, Badge, Button, DemoBadge, PageHeader } from "@/components/ui";
import { isLocale, type Locale } from "@/i18n/config";
import { getProfile, getRoles, requireUser, type AppRole } from "@/lib/auth/session";
import { getAvatarPhotoState } from "@/lib/avatar/availability";
import { itemsForDate, pickProgramSuggestions, shortTime, sortRoutine, type EnrollmentLike } from "@/lib/routine/today";
import { createClient } from "@/lib/supabase/server";
import { resolveTheme } from "@/lib/theme/constants";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("profile") };
}

// Perfil: "Hoje" (ritmo do dia: programas + itens manuais), visão geral (avatar, nome, e-mail, papéis,
// plano simulado, portais), dados editáveis e atalhos.

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

const PORTALS: Array<{ role: Exclude<AppRole, "consumer">; href: string; icon: LucideIcon }> = [
  { role: "admin", href: "/admin", icon: ShieldCheck },
  { role: "creator", href: "/creator", icon: Sparkles },
  { role: "seller", href: "/seller", icon: Store },
];

const LINKS: Array<{ key: "plan" | "interests" | "favorites" | "recipes" | "orders" | "notifications" | "account"; href: string; icon: LucideIcon }> = [
  { key: "plan", href: "/profile/plan", icon: CreditCard },
  { key: "interests", href: "/profile/interests", icon: Sparkles },
  { key: "favorites", href: "/profile/favorites", icon: Heart },
  { key: "recipes", href: "/profile/receitas", icon: ChefHat },
  { key: "orders", href: "/orders", icon: Package },
  { key: "notifications", href: "/profile/notifications", icon: Bell },
  { key: "account", href: "/profile/account", icon: Shield },
];

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const [profile, roles, locale, t, tc, photoState] = await Promise.all([
    getProfile(),
    getRoles(),
    getLocale(),
    getTranslations("me.profile"),
    getTranslations("common"),
    getAvatarPhotoState(),
  ]);
  const supabase = await createClient();
  const tz = isValidTimeZone(profile?.timezone) ? profile.timezone : "UTC";
  const today = localDateIn(tz);
  const [{ data: subscriptionRaw }, routineRes, checksRes, enrollmentsRes, completionsRes, streakRes] = await Promise.all([
    supabase.rpc("my_subscription"),
    supabase.from("routine_items").select("id, title, note, time_of_day, weekdays, active, sort_order").eq("user_id", user.id).eq("active", true).order("sort_order"),
    supabase.from("routine_checks").select("item_id, done").eq("user_id", user.id).eq("local_date", today),
    supabase.from("enrollments").select(ENROLLMENT_SELECT).eq("user_id", user.id).eq("status", "active").order("enrolled_at", { ascending: false }),
    supabase.from("completions").select("content_id").eq("user_id", user.id).limit(2000),
    supabase.rpc("compute_streak", { p_user: user.id, p_timezone: tz }),
  ]);
  // Resumo da Evolução (a página completa fica em /profile/evolution).
  const currentStreak = Number(streakRes.data ?? 0);
  const completionsCount = (completionsRes.data ?? []).length;
  const subscription = parseSubscription(subscriptionRaw);

  // Ritmo de hoje: itens manuais válidos na data local + próximos itens obrigatórios dos programas.
  const doneToday = new Set((checksRes.data ?? []).filter((c) => c.done).map((c) => c.item_id));
  const routineItems: RhythmItem[] = sortRoutine(itemsForDate(routineRes.data ?? [], today)).map((item) => ({
    id: item.id,
    title: item.title,
    note: item.note,
    time: shortTime(item.time_of_day),
    weekdays: item.weekdays,
    done: doneToday.has(item.id),
  }));
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
  const portals = PORTALS.filter((p) => roleSet.includes(p.role));
  const uiLocale: Locale = isLocale(profile?.locale) ? profile.locale : (locale as Locale);
  const theme = resolveTheme(profile?.theme);
  const planKey = subscription.status === "anonymous" ? "unknown" : subscription.status;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} actions={<DemoBadge />} />

      {/* Hoje: ritmo do dia (banco) + hidratação e descanso (só no aparelho) */}
      <TodaySection localDate={today} suggestions={suggestions} items={routineItems} />

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

      {/* Visão geral */}
      <section aria-label={t("title")} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-start">
        <Avatar src={profile?.avatar_url} name={displayName} size="xl" alt="" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="type-h2 truncate text-fg">{displayName}</h2>
          <p className="type-body-sm truncate text-fg-muted">
            <span className="sr-only">{t("emailLabel")}: </span>
            {user.email}
          </p>
          <ul className="flex flex-wrap gap-1.5" aria-label={t("roles.label")}>
            {roleSet.map((role) => (
              <li key={role}>
                <Badge variant={role === "admin" ? "accent" : "neutral"}>{t(`roles.${role}`)}</Badge>
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap items-center gap-2 text-sm text-fg">
            <span className="font-semibold">{t("plan.label")}:</span>
            <Badge variant={subscription.status === "active" ? "premium" : subscription.status === "cancelled" ? "warning" : "free"}>{t(`plan.${planKey}`)}</Badge>
            <Link href="/profile/plan" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              {t("plan.manage")}
            </Link>
          </p>
          <p className="type-caption text-fg-muted">{t("demoNote")}</p>
        </div>
        <form action="/auth/signout" method="post" className="sm:self-start">
          <Button type="submit" variant="secondary" size="sm" leadingIcon={<LogOut />}>
            {t("signOut")}
          </Button>
        </form>
      </section>

      {portals.length > 0 ? (
        <section aria-labelledby="portals-title" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="portals-title" className="type-h2 text-fg">
              {t("portals.title")}
            </h2>
            <p className="type-body-sm text-fg-muted">{t("portals.description")}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {portals.map(({ role, href, icon: Icon }) => (
              <li key={role}>
                <Link
                  href={href}
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-[border-color,box-shadow] hover:border-accent/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <Icon className="size-5 text-accent-text" aria-hidden="true" />
                  <span className="flex-1 text-sm font-semibold text-fg">{t(`portals.${role}`)}</span>
                  <ChevronRight className="size-4 text-fg-muted" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Dados */}
      <section aria-labelledby="data-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-accent-text">
            <UserCog className="size-5" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 id="data-title" className="type-h3 text-fg">
              {t("data.title")}
            </h2>
            <p className="type-body-sm text-fg-muted">{t("data.description")}</p>
          </div>
        </div>
        <ProfileDataForm displayName={displayName} avatarUrl={profile?.avatar_url ?? null} locale={uiLocale} theme={theme} photoState={photoState} />
      </section>

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
    </div>
  );
}
