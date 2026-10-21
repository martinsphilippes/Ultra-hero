import type { Metadata } from "next";
import { Info, LibraryBig, ShieldCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { InlineError } from "@/components/discover/InlineError";
import { LibraryList } from "@/components/discover/personalities/LibraryList";
import { Badge, EmptyState, PillarBadge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { hubHref, loadCreator, loadCreatorHub } from "@/lib/catalog/creator-hub";
import { effectiveRightsStatus, showsFictionalBadge } from "@/lib/catalog/rights";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [creator, t] = await Promise.all([loadCreator(slug), getTranslations("discover.meta")]);
  if (!creator) return {};
  return { title: t("personality", { name: creator.name }), description: creator.headline ?? undefined };
}

// Hub do herói (RF-004): capa, identidade, bibliotecas por tipo e pilar e a nota de direitos
// (fictício, em validação ou autorizado). Cada biblioteca tem a sua própria página.
export default async function PersonalityPage({ params, searchParams }: Props) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);

  // As abas antigas viravam ?tab=…: Produtos e Programas viram bibliotecas; o resto volta ao hub.
  const tab = first(raw.tab);
  if (tab !== undefined) permanentRedirect(hubHref(slug, tab === "produtos" || tab === "programas" ? tab : undefined));

  const [creator, t, tl, locale] = await Promise.all([loadCreator(slug), getTranslations("discover.personalities.profile"), getTranslations("discover.personalities.libraries"), getLocale()]);
  if (!creator) notFound();

  // RB-05: só "autorizado" com titular documentado e dentro da validade tira o selo de fictício.
  const rights = effectiveRightsStatus(creator.rights_status, creator.rights_valid_until);
  const hub = await loadCreatorHub(creator);
  const hasError = hub.errors.contents || hub.errors.programs || hub.errors.products;

  const cover = creator.cover_url ?? `/placeholders/cover-${creator.pillars[0] ?? "routine"}-2.svg`;
  const avatar = creator.avatar_url ?? "/placeholders/avatar-1.svg";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/personalities" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        ← {t("back")}
      </Link>

      <header className="flex flex-col gap-4">
        <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl border border-border bg-surface-elevated sm:aspect-[3/1]">
          <Image src={cover} alt={t("coverAlt", { name: creator.name })} fill priority unoptimized={cover.endsWith(".svg")} sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-obsidian/60 via-transparent to-transparent" />
        </div>

        <div className="-mt-14 flex flex-col gap-4 px-2 sm:-mt-16 sm:flex-row sm:items-end sm:px-4">
          <span className="relative inline-flex size-24 shrink-0 overflow-hidden rounded-full border-4 border-bg bg-surface-elevated shadow-md sm:size-28">
            <Image src={avatar} alt="" fill unoptimized={avatar.endsWith(".svg")} sizes="112px" className="object-cover" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="type-h1 text-balance text-fg">{creator.name}</h1>
              {showsFictionalBadge(rights) && <Badge variant="demo">{t("fictional")}</Badge>}
              {rights === "pending" && <Badge variant="info">{t("rightsPendingBadge")}</Badge>}
            </div>
            {creator.headline && <p className="type-body text-fg-muted">{creator.headline}</p>}
            <ul className="flex flex-wrap gap-1.5" aria-label={t("pillarsLabel")}>
              {creator.pillars.map((pillar) => (
                <li key={pillar}>
                  <PillarBadge pillar={pillar} />
                </li>
              ))}
            </ul>
            <p className="type-overline text-fg-muted">
              {t("stats.contents", { count: hub.contents.length })} · {t("stats.programs", { count: hub.programs.length })}
              {hub.commerceEnabled && hub.products.length > 0 ? ` · ${t("stats.products", { count: hub.products.length })}` : null}
            </p>
          </div>
        </div>

        {creator.bio && <p className="type-body max-w-prose whitespace-pre-line text-fg sm:px-4">{creator.bio}</p>}
      </header>

      <section aria-labelledby="hero-libraries-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="hero-libraries-title" className="type-h2 text-fg">
            {tl("title", { name: creator.name })}
          </h2>
          <p className="type-body-sm text-fg-muted">{tl("description", { name: creator.name })}</p>
        </div>
        {hasError ? <InlineError /> : null}
        {hub.libraries.length > 0 ? (
          <LibraryList slug={creator.slug} libraries={hub.libraries} />
        ) : hasError ? null : (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState icon={<LibraryBig />} title={tl("empty")} description={tl("emptyDescription", { name: creator.name })} />
          </div>
        )}
      </section>

      {/* Nota de direitos (RB-05): fictício ou em validação nunca aparecem como autorizado;
          autorizado exibe o titular e a validade registrados pela administração. */}
      <aside
        aria-label={t("rightsTitle")}
        className={cn(
          "flex gap-3 rounded-xl border border-dashed p-4",
          rights === "authorized" ? "border-success/40 bg-success-soft/40" : "border-warning/40 bg-warning-soft/40",
        )}
      >
        {rights === "authorized" ? (
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        )}
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold text-fg">{t("rightsTitle")}</p>
          {rights === "authorized" ? (
            <p className="type-body-sm text-fg-muted">
              {t("rightsAuthorized", { holder: creator.rights_holder ?? "" })}
              {creator.rights_valid_until ? ` ${t("rightsValidUntil", { date: formatPlainDate(creator.rights_valid_until, locale as Locale) })}` : ""}
            </p>
          ) : (
            <p className="type-body-sm text-fg-muted">
              {creator.rights_note?.trim() || t("rightsDefault")}
              {rights === "pending" ? ` ${t("rightsPending")}` : ""}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
