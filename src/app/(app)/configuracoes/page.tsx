import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  Bell,
  BellRing,
  ChefHat,
  ChevronRight,
  CreditCard,
  Heart,
  Languages,
  LogOut,
  Package,
  Shield,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Stethoscope,
  Store,
  TriangleAlert,
  Users,
  Watch,
  type LucideIcon,
} from "lucide-react";
import { isValidTimeZone, localDateIn } from "@/components/me/dates";
import { Button, PageHeader } from "@/components/ui";
import { getProfile, getRoles, requireUser } from "@/lib/auth/session";
import { appliesOn } from "@/lib/routine/reminders";
import { buildSettingsSections, DELETE_ACCOUNT_HREF, SETTINGS_PATH, type SettingsItem } from "@/lib/settings/sections";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.settings");
  return { title: t("title") };
}

const ICONS: Record<SettingsItem["key"], LucideIcon> = {
  reminders: BellRing,
  heroes: Users,
  interests: Sparkles,
  favorites: Heart,
  recipes: ChefHat,
  shoppingList: ShoppingBasket,
  orders: Package,
  plan: CreditCard,
  account: Shield,
  notifications: Bell,
  devices: Watch,
  appearance: Languages,
  seller: Store,
  professional: Stethoscope,
  admin: ShieldCheck,
};

const rowClass =
  "flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus sm:px-5";

// Configurações (pedido do responsável): tudo o que ficava em linhas no Perfil, abaixo do Hoje, mora
// aqui, em seções. Abre pelo avatar do cabeçalho e pela linha "Configurações" no fim do Perfil.
// Mesmos destinos e as mesmas travas de antes (papéis, app das lojas); Sair e Excluir conta no fim.
export default async function SettingsPage() {
  const user = await requireUser(SETTINGS_PATH);
  const [profile, roles, t, tp, tc] = await Promise.all([getProfile(), getRoles(), getTranslations("me.settings"), getTranslations("me.profile"), getTranslations("common")]);
  const sections = buildSettingsSections(Array.from(new Set(roles.map((r) => r.role))));

  // resumo da linha de Lembretes (como era no Perfil); se a leitura falhar, a linha fica sem contagem
  const supabase = await createClient();
  const remindersRes = await supabase.from("routine_items").select("weekdays, active").eq("user_id", user.id).eq("active", true);
  const reminders = remindersRes.error ? null : (remindersRes.data ?? []);
  const today = localDateIn(isValidTimeZone(profile?.timezone) ? profile.timezone : "UTC");
  const remindersHint =
    reminders && reminders.length > 0
      ? `${tp("reminders.today", { n: reminders.filter((r) => appliesOn(r, today)).length })} · ${tp("reminders.total", { n: reminders.length })}`
      : tp("reminders.description");

  const text = (item: SettingsItem): { title: string; hint: string } => {
    if (item.kind === "portal") return { title: tp(`portals.${item.key}`), hint: tp(`portals.hints.${item.key}`) };
    switch (item.key) {
      case "reminders":
        return { title: tp("reminders.title"), hint: remindersHint };
      case "devices":
      case "appearance":
        return { title: t(`rows.${item.key}.title`), hint: t(`rows.${item.key}.description`) };
      default:
        return { title: tp(`links.${item.key}.title`), hint: tp(`links.${item.key}.description`) };
    }
  };

  return (
    <div className="flex flex-col gap-8" data-testid="settings-page">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} backHref="/profile" backLabel={tp("title")} />

      {sections.map((section) => (
        <section key={section.key} aria-labelledby={`settings-${section.key}`} data-testid={`settings-section-${section.key}`} className="flex flex-col gap-2">
          <h2 id={`settings-${section.key}`} className="type-overline px-1 text-fg-muted">
            {t(`sections.${section.key}`)}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {section.items.map((item) => {
              const Icon = ICONS[item.key];
              const { title, hint } = text(item);
              const body = (
                <>
                  <span aria-hidden="true" className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", item.kind === "portal" ? "bg-accent text-accent-fg" : "bg-surface-elevated text-accent-text")}>
                    <Icon className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold text-fg">{title}</span>
                    <span className="type-caption text-fg-muted">{hint}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                </>
              );
              const testId = item.kind === "portal" ? `settings-portal-${item.key}` : `settings-link-${item.key}`;
              return (
                <li key={item.key} className={cn(item.nativeHidden && "native:hidden")}>
                  {item.href.includes("#") ? (
                    // âncora em outra página (abre o editor do Perfil): carga completa, o hash chega no primeiro render
                    <a href={item.href} data-testid={testId} className={rowClass}>
                      {body}
                    </a>
                  ) : (
                    <Link href={item.href} data-testid={testId} className={rowClass}>
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* Sair e Excluir conta: no fim, como no Instagram */}
      <div className="flex flex-col items-start gap-3">
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="secondary" leadingIcon={<LogOut />} data-testid="settings-signout">
            {tp("signOut")}
          </Button>
        </form>
        <a
          href={DELETE_ACCOUNT_HREF}
          data-testid="settings-delete-account"
          className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-danger hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <TriangleAlert className="size-4" aria-hidden="true" />
          {t("deleteAccount")}
        </a>
        <p className="type-caption text-fg-muted native:hidden">{tp("demoNote")}</p>
      </div>
    </div>
  );
}
