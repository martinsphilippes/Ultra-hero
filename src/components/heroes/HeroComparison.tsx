import { ArrowRight, Info, Scale } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { isValidTimeZone, localDateIn, shiftDate } from "@/components/me/dates";
import { AvatarInitials } from "@/components/ui";
import { AvatarImage } from "@/components/ui/avatar-image";
import { getProfile, getUser } from "@/lib/auth/session";
import { appMetrics, compareRows, COMPARE_METRIC_DEFS, displayPct, watchMetrics, type CompareMetricKey, type CompareRow } from "@/lib/heroes/compare";
import { loadCompareCreatorId, loadMyFollows, loadReferences } from "@/lib/heroes/follow-queries";
import { createClient } from "@/lib/supabase/server";
import type { WatchSnapshot } from "@/lib/wearables/demo";
import { cn } from "@/lib/utils";

type Props = {
  /** Relógio da PRÓPRIA pessoa (demo ou real); null = sem relógio (o "Exemplo" não conta). */
  watch: Pick<WatchSnapshot, "history"> | null;
  /** Só estes indicadores (seções do Hoje); ausente = todos com referência. */
  only?: readonly CompareMetricKey[];
  /** Sem Hero escolhido: mostra o convite para escolher (true) ou nada (false, nas seções). */
  invite?: boolean;
  headingLevel?: "h2" | "h3";
};

// "Você vs Hero" (0056): cada indicador que a pessoa tem, com barras e a frase "Seu sono está em 85%
// da referência de Neymar". O lado do herói é a REFERÊNCIA da equipe, sempre rotulada assim.
// Sem a 0056 no banco (ou sem nada para comparar), não renderiza nada.
export async function HeroComparison({ watch, only, invite = true, headingLevel = "h2" }: Props) {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const compareId = await loadCompareCreatorId(supabase, user.id);
  if (compareId === undefined) return null;
  const [t, locale] = await Promise.all([getTranslations("follows.compare"), getLocale()]);
  const Heading = headingLevel;

  if (compareId === null) {
    if (!invite) return null;
    // convite só para quem já segue alguém (seguir é o caminho para comparar)
    const follows = await loadMyFollows(supabase, user.id);
    if (!follows.available || follows.ids.length === 0) return null;
    return (
      <section aria-labelledby="hero-compare-invite" className="flex flex-col gap-3 rounded-2xl border border-dashed border-border-strong bg-surface p-5" data-testid="hero-compare-invite">
        <Heading id="hero-compare-invite" className="type-h3 text-fg">
          {t("chooseTitle")}
        </Heading>
        <p className="type-body-sm max-w-prose text-fg-muted">{t("chooseDescription")}</p>
        <Link href="/profile/herois" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {t("chooseCta")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </section>
    );
  }

  const profile = await getProfile();
  const tz = isValidTimeZone(profile?.timezone) ? profile.timezone : "UTC";
  const today = localDateIn(tz);
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [heroRes, references, eventsRes, completionsRes] = await Promise.all([
    supabase.from("creator_profiles").select("id, slug, name, avatar_url").eq("id", compareId).maybeSingle(),
    loadReferences(supabase, compareId),
    supabase.from("streak_events").select("local_date").eq("user_id", user.id).gte("local_date", shiftDate(today, -6)).limit(100),
    supabase.from("completions").select("completed_at, content:content(type)").eq("user_id", user.id).gte("completed_at", since).limit(500),
  ]);
  const hero = heroRes.data;
  if (!hero || references === null) return null;

  const app =
    eventsRes.error || completionsRes.error
      ? {}
      : appMetrics({
          activeDates: (eventsRes.data ?? []).map((e) => e.local_date),
          today,
          completions: ((completionsRes.data ?? []) as unknown as { completed_at: string; content: { type: string } | null }[]).map((c) => ({ completedAt: c.completed_at, type: c.content?.type ?? null })),
        });
  const mine = { ...(watch ? watchMetrics(watch) : {}), ...app };
  const refs = Object.fromEntries(references.map((r) => [r.key, r.value]));
  const rows = compareRows(refs, mine, only);
  if (only && rows.length === 0) return null;

  const number = (key: CompareMetricKey, value: number) => {
    const d = COMPARE_METRIC_DEFS[key].decimals;
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: d }).format(d === 0 ? Math.round(value) : value);
  };
  const tm = (key: CompareMetricKey, field: "label" | "value", value?: number) => (field === "label" ? t(`metrics.${key}.label`) : t(`metrics.${key}.value`, { value: number(key, value ?? 0) }));

  return (
    <section aria-labelledby="hero-compare-title" className="flex flex-col gap-4 rounded-2xl border border-accent/30 bg-surface p-5" data-testid="hero-compare" data-hero={hero.slug}>
      <div className="flex items-center gap-3">
        <span className="relative inline-flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-elevated text-sm font-bold uppercase text-fg-muted">
          <AvatarImage src={hero.avatar_url} alt="" fallback={<AvatarInitials name={hero.name} />} fill sizes="48px" className="object-cover" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <Heading id="hero-compare-title" className="type-h3 text-fg">
            {t("title", { name: hero.name })}
          </Heading>
          <p className="type-caption text-fg-muted">{t("description", { name: hero.name })}</p>
        </div>
        <Link href="/profile/herois" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <Scale className="size-4" aria-hidden="true" />
          {t("change")}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="type-body-sm text-fg-muted">{t("noReferences", { name: hero.name })}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((row) => (
            <CompareItem key={row.key} row={row} heroName={hero.name} label={tm(row.key, "label")} you={t("you")} referenceLabel={t("reference", { name: hero.name })}
              userText={row.user === null ? null : tm(row.key, "value", row.user)}
              refText={tm(row.key, "value", row.reference)}
              phrase={row.comparison ? t(`metrics.${row.key}.phrase`, { pct: displayPct(row.comparison.pct), name: hero.name }) : t("noWatch")}
              status={row.comparison ? t(`status.${row.comparison.status}`) : null}
            />
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2 type-caption text-fg-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t("referenceNote", { name: hero.name })}
      </p>
    </section>
  );
}

type ItemProps = {
  row: CompareRow;
  heroName: string;
  label: string;
  you: string;
  referenceLabel: string;
  userText: string | null;
  refText: string;
  phrase: string;
  status: string | null;
};

function CompareItem({ row, label, you, referenceLabel, userText, refText, phrase, status }: ItemProps) {
  const c = row.comparison;
  return (
    <li className="flex flex-col gap-2" data-testid="hero-compare-row" data-metric={row.key} data-status={c?.status ?? "no-data"}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-semibold text-fg">{label}</p>
        {status ? (
          <p className={cn("type-caption font-semibold", c?.status === "below" ? "text-fg-muted" : "text-accent-text")}>{status}</p>
        ) : null}
      </div>
      {/* barras: a maior das duas ocupa a largura toda; o texto ao lado repete os números */}
      <dl className="grid grid-cols-[minmax(5rem,auto)_1fr] items-center gap-x-3 gap-y-1.5">
        <dt className="type-caption text-fg-muted">{you}</dt>
        <dd className="flex items-center gap-2">
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-elevated" aria-hidden="true">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${c?.userBar ?? 0}%` }} />
          </span>
          <span className="type-caption type-numeric min-w-20 text-right text-fg">{userText ?? "—"}</span>
        </dd>
        <dt className="type-caption text-fg-muted">{referenceLabel}</dt>
        <dd className="flex items-center gap-2">
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-elevated" aria-hidden="true">
            <span className="block h-full rounded-full bg-fg-subtle" style={{ width: `${c?.refBar ?? 100}%` }} />
          </span>
          <span className="type-caption type-numeric min-w-20 text-right text-fg">{refText}</span>
        </dd>
      </dl>
      <p className="type-body-sm text-fg">{phrase}</p>
    </li>
  );
}
