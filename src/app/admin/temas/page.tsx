import type { Metadata } from "next";
import { ChevronRight, Plus } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ThemesControls } from "@/components/seasonal-theme/ThemesControls";
import { ThemeTimeline } from "@/components/seasonal-theme/ThemeTimeline";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui";
import { defaultTimeZone } from "@/i18n/config";
import type { AdminTheme } from "@/lib/seasonal-theme/form";
import { resolveActive, themePhase, type ThemePhase } from "@/lib/seasonal-theme/resolve";
import { loadAdminThemes } from "@/lib/seasonal-theme/server";
import { SEASON_AREAS } from "@/lib/seasonal-theme/vocab";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seasonalTheme.admin");
  return { title: t("title") };
}

const PHASES: ThemePhase[] = ["active", "scheduled", "draft", "incomplete", "ended"];
const PHASE_BADGE: Record<ThemePhase, "success" | "info" | "neutral" | "warning"> = { active: "success", scheduled: "info", draft: "neutral", incomplete: "warning", ended: "neutral" };

// Layout dinâmico (0100), só o admin geral: interruptor global, restaurar padrão, o que vale agora em cada área, linha
// do tempo de 60 dias com conflitos de prioridade e as listas (ativos, programados, rascunhos, incompletos, encerrados).
export default async function AdminThemesPage() {
  const [t, format, data] = await Promise.all([getTranslations("seasonalTheme.admin"), getFormatter(), loadAdminThemes()]);
  const now = new Date();
  const header = (
    <PageHeader
      title={t("title")}
      description={t("description")}
      actions={
        <Button asChild size="sm" leadingIcon={<Plus />}>
          <Link href="/admin/temas/novo" data-testid="theme-new">
            {t("new")}
          </Link>
        </Button>
      }
    />
  );
  if (!data.available || data.forbidden) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyState title={data.forbidden ? t("forbidden") : t("unavailable")} />
      </div>
    );
  }
  const phase = (x: AdminTheme) => themePhase(x, now);
  const live = data.enabled
    ? data.themes.filter((x) => phase(x) === "active").map((x) => ({ ...x, windowStart: x.windowStart!, windowEnd: x.windowEnd! }))
    : [];
  const when = (iso: string | null, tz: string) => (iso ? format.dateTime(new Date(iso), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz }) : "—");

  return (
    <div className="flex flex-col gap-5" data-testid="admin-themes">
      {header}
      <ThemesControls enabled={data.enabled} activeCount={data.themes.filter((x) => phase(x) === "active").length} />
      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4" data-testid="themes-now">
        <h2 className="type-h3">{t("nowTitle")}</h2>
        <ul className="flex flex-col gap-1 type-body-sm">
          {SEASON_AREAS.map((area) => {
            const w = resolveActive(live, now, area);
            return (
              <li key={area} className="flex flex-wrap justify-between gap-2">
                <span className="text-fg-muted">{t(`area.${area}`)}</span>
                <span className="font-semibold">{w ? w.name : t("defaultIdentity")}</span>
              </li>
            );
          })}
        </ul>
        {!data.enabled ? <p className="type-caption text-warning">{t("globalOffHint")}</p> : null}
      </section>
      <ThemeTimeline themes={data.themes} now={now} timeZone={defaultTimeZone} />
      {data.themes.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyHint")} />
      ) : (
        PHASES.map((p) => {
          const list = data.themes.filter((x) => phase(x) === p);
          if (list.length === 0) return null;
          return (
            <section key={p} className="flex flex-col gap-2" data-testid={`themes-${p}`}>
              <h2 className="type-h3">
                {t(`phase.${p}`)} <span className="text-fg-muted">({list.length})</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {list.map((x) => (
                  <li key={x.id}>
                    <Link href={`/admin/temas/${x.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 hover:bg-surface-hover">
                      <span className="flex shrink-0 gap-0.5" aria-hidden="true">
                        <span className="size-5 rounded-l-md border border-border" style={{ background: x.tokens.light?.accent ?? "transparent" }} />
                        <span className="size-5 rounded-r-md border border-border" style={{ background: x.tokens.dark?.accent ?? "transparent" }} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold">{x.name}</span>
                          <Badge size="sm" variant={PHASE_BADGE[p]}>
                            {t(`phase.${p}`)}
                          </Badge>
                        </span>
                        <span className="block type-caption text-fg-muted">
                          {when(x.windowStart, x.timezone)} → {when(x.windowEnd, x.timezone)} · {t("priorityShort", { value: x.priority })}
                        </span>
                        {x.event ? <span className="block truncate type-caption text-fg-muted">{t("linkedTo", { title: x.event.title })}</span> : null}
                        {x.eventCancelled ? <span className="block type-caption text-danger">{t("eventCancelledWarning")}</span> : null}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
