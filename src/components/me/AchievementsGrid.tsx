import { Award, CalendarCheck, Flame, Footprints, Lock, Mountain, Sparkles, Trophy, type LucideIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { cn } from "@/lib/utils";

export type AchievementRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  rule: unknown;
};

type Props = {
  achievements: AchievementRow[];
  earned: Map<string, string>;
  timeZone: string;
  className?: string;
};

const ICONS: Record<string, LucideIcon> = {
  footprints: Footprints,
  flame: Flame,
  mountain: Mountain,
  "calendar-check": CalendarCheck,
  sparkles: Sparkles,
  trophy: Trophy,
  award: Award,
};

// Grade de conquistas: todas as ativas, as bloqueadas esmaecidas com a regra em linguagem simples.
export async function AchievementsGrid({ achievements, earned, timeZone, className }: Props) {
  const [t, locale] = await Promise.all([getTranslations("me.evolution.achievements"), getLocale()]);
  const uiLocale = locale as Locale;

  const ruleText = (rule: unknown): string => {
    const r = (rule && typeof rule === "object" ? rule : {}) as Record<string, unknown>;
    const kind = String(r.kind ?? "");
    if (kind === "streak") return t("rules.streak", { days: Number(r.days ?? 1) });
    if (kind === "completions") return t("rules.completions", { count: Number(r.count ?? 1) });
    if (kind === "program_completed") return t("rules.program_completed", { count: Number(r.count ?? 1) });
    return t("rules.unknown");
  };

  return (
    <ul className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)} aria-label={t("title")}>
      {achievements.map((achievement) => {
        const earnedAt = earned.get(achievement.id) ?? null;
        const Icon = ICONS[achievement.icon ?? ""] ?? Award;
        const name = t.has(`names.${achievement.code}`) ? t(`names.${achievement.code}`) : achievement.name;
        return (
          <li
            key={achievement.id}
            className={cn("flex items-start gap-3 rounded-xl border p-4", earnedAt ? "border-accent/40 bg-accent-soft/30" : "border-border bg-surface opacity-80")}
          >
            <span
              aria-hidden="true"
              className={cn("relative flex size-11 shrink-0 items-center justify-center rounded-xl", earnedAt ? "bg-accent text-accent-fg" : "bg-surface-elevated text-fg-subtle")}
            >
              <Icon className="size-5" />
              {!earnedAt && <Lock className="absolute -bottom-1 -right-1 size-3.5 rounded-full bg-surface p-0.5 text-fg-muted" />}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={cn("text-sm font-semibold", earnedAt ? "text-fg" : "text-fg-muted")}>{name}</h3>
                <Badge variant={earnedAt ? "success" : "neutral"} size="sm">
                  {earnedAt ? t("earned") : t("locked")}
                </Badge>
              </div>
              <p className="type-caption text-fg-muted">{ruleText(achievement.rule)}</p>
              {earnedAt ? <p className="type-caption text-fg-muted">{t("earnedOn", { date: formatDate(earnedAt, uiLocale, undefined, timeZone) })}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
