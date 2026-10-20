import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { EyeOff } from "lucide-react";
import { InterestsForm } from "@/components/me/InterestsForm";
import type { InterestGroup } from "@/components/me/InterestTagGrid";
import { RestoreNotInterestedButton } from "@/components/me/RestoreNotInterestedButton";
import { PageHeader, PillarBadge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { requireUser } from "@/lib/auth/session";
import { localizedLabel } from "@/lib/catalog/queries";
import { PILLARS, type Pillar } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("interests") };
}

// Interesses: interest_tags agrupadas por pilar (rótulo localizado), user_interests e lista de "não tenho interesse".

type HiddenRow = { content_id: string; created_at: string; content: { slug: string; title: string; pillar: Pillar } | null };

export default async function InterestsPage() {
  const user = await requireUser("/profile/interests");
  const [locale, t, tc] = await Promise.all([getLocale(), getTranslations("me.interests"), getTranslations("common")]);
  const uiLocale = locale as Locale;
  const supabase = await createClient();

  const [tagsRes, mineRes, hiddenRes] = await Promise.all([
    supabase.from("interest_tags").select("tag, label, pillar, sort_order").order("sort_order", { ascending: true }),
    supabase.from("user_interests").select("tag").eq("user_id", user.id),
    supabase.from("not_interested").select("content_id, created_at, content:content(slug, title, pillar)").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);
  const firstError = [tagsRes, mineRes, hiddenRes].find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const byPillar = new Map<Pillar | null, InterestGroup["tags"]>();
  for (const row of tagsRes.data ?? []) {
    const key = (row.pillar as Pillar | null) ?? null;
    if (!byPillar.has(key)) byPillar.set(key, []);
    byPillar.get(key)!.push({ tag: row.tag, label: localizedLabel(row.label, uiLocale) || row.tag });
  }
  const groups: InterestGroup[] = [...PILLARS, null].filter((p) => byPillar.has(p)).map((pillar) => ({ pillar, tags: byPillar.get(pillar)! }));
  const initial = (mineRes.data ?? []).map((r) => r.tag);
  const hidden = (hiddenRes.data ?? []) as unknown as HiddenRow[];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} backHref="/profile" backLabel={tc("actions.back")} />

      <section aria-label={t("title")} className="rounded-2xl border border-border bg-surface p-5">
        <InterestsForm groups={groups} initial={initial} />
      </section>

      <section aria-labelledby="hidden-title" className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-fg-muted">
            <EyeOff className="size-5" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 id="hidden-title" className="type-h2 text-fg">
              {t("notInterested.title")}
            </h2>
            <p className="type-body-sm text-fg-muted">{t("notInterested.description")}</p>
          </div>
        </div>
        {hidden.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong bg-surface/60 px-4 py-6 text-center type-body-sm text-fg-muted">{t("notInterested.empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
            {hidden.map((row) => (
              <li key={row.content_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {row.content ? (
                    <Link href={`/content/${row.content.slug}`} className="line-clamp-1 text-sm font-semibold text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                      {row.content.title}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold text-fg-muted">{row.content_id}</span>
                  )}
                  {row.content ? <PillarBadge pillar={row.content.pillar} size="sm" className="w-fit" /> : null}
                </span>
                <RestoreNotInterestedButton contentId={row.content_id} title={row.content?.title ?? row.content_id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
