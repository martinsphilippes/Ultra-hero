import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Search } from "lucide-react";
import { StatusBadge } from "@/components/admin";
import { Panel } from "@/components/admin-content";
import { TranslationEditor } from "@/components/admin-content/TranslationEditor";
import { escapeLike, firstParam, pickSearch, pickUuid, type SearchParams } from "@/components/admin-content/lib/search-params";
import type { ReactNode } from "react";
import { Badge, Button, FormField, Input, PageHeader } from "@/components/ui";
import { locales, type Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { loadLocalizedBody } from "@/lib/catalog/localized-body";
import { conceptColumnSupported } from "@/lib/programs/concept-query";
import type { Enums } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Traduções: escolhe conteúdo (ou versão de programa) via busca GET e edita cada idioma lado a lado.

type Kind = "content" | "program";
type LocaleCode = Enums<"locale_code">;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.translations");
  return { title: t("title") };
}

export default async function AdminTranslationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const kind: Kind = firstParam(params, "kind") === "program" ? "program" : "content";
  const id = pickUuid(params, "id");
  const q = pickSearch(params);
  const supabase = await createClient();
  const [t, tc, ts, locale] = await Promise.all([
    getTranslations("adminContent.translations"),
    getTranslations("adminContent.common"),
    getTranslations("adminCommon.status"),
    getLocale(),
  ]);
  const uiLocale = locale as Locale;

  // Busca (GET) por título: conteúdos de qualquer status ou versões de programa.
  let results: { id: string; title: string; subtitle: string; status: string }[] = [];
  if (q && !id) {
    if (kind === "content") {
      const { data } = await supabase.from("content").select("id, title, status, source_locale, creator:creator_profiles(name)").ilike("title", `%${escapeLike(q)}%`).order("title").limit(20);
      results = ((data ?? []) as unknown as { id: string; title: string; status: string; source_locale: string; creator: { name: string } | null }[]).map((c) => ({
        id: c.id,
        title: c.title,
        subtitle: [c.creator?.name, tc(`localeName.${c.source_locale}` as never)].filter(Boolean).join(" · "),
        status: c.status,
      }));
    } else {
      const { data } = await supabase
        .from("program_versions")
        .select("id, title, version_no, status, source_locale, program:programs!program_versions_program_id_fkey(slug)")
        .ilike("title", `%${escapeLike(q)}%`)
        .order("title")
        .limit(20);
      results = ((data ?? []) as unknown as { id: string; title: string; version_no: number; status: string; source_locale: string; program: { slug: string } | null }[]).map((v) => ({
        id: v.id,
        title: t("versionLabel", { title: v.title, n: v.version_no }),
        subtitle: [v.program?.slug, tc(`localeName.${v.source_locale}` as never)].filter(Boolean).join(" · "),
        status: v.status,
      }));
    }
  }

  // Item escolhido: original + traduções existentes.
  let editor: ReactNode = null;
  if (id) {
    if (kind === "content") {
      const [{ data: content }, { data: body }, { data: locs }] = await Promise.all([
        supabase.from("content").select("id, title, summary, source_locale, status").eq("id", id).maybeSingle(),
        supabase.from("content_bodies").select("body").eq("content_id", id).maybeSingle(),
        // sem body: desde a 0027 o corpo traduzido sai pela RPC (abaixo), não pelo select
        supabase.from("content_localizations").select("locale, title, summary, status, updated_at").eq("content_id", id),
      ]);
      if (content) {
        const targets = locales.filter((l) => l !== content.source_locale);
        const bodies = new Map(
          await Promise.all(targets.map(async (l) => [l, await loadLocalizedBody(supabase, content.id, l as LocaleCode)] as const)),
        );
        editor = (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="type-h3 text-fg">{content.title}</h2>
              <StatusBadge status={content.status} label={ts(content.status)} />
              <Badge size="sm">{tc(`localeName.${content.source_locale}` as never)}</Badge>
            </div>
            {targets.map((target) => {
              const existing = (locs ?? []).find((l) => l.locale === target) ?? null;
              return (
                <TranslationEditor
                  key={target}
                  kind="content"
                  targetId={content.id}
                  locale={target as LocaleCode}
                  localeLabel={tc(`localeName.${target}` as never)}
                  sourceLocaleLabel={tc(`localeName.${content.source_locale}` as never)}
                  source={{ title: content.title, summary: content.summary, body: body?.body ?? null }}
                  existing={existing ? { title: existing.title, summary: existing.summary, body: bodies.get(target) ?? null, status: existing.status as "draft" | "published", updated_at: existing.updated_at } : null}
                  existingLabel={existing ? t("existing", { date: formatDateTime(existing.updated_at, uiLocale) }) : null}
                />
              );
            })}
          </div>
        );
      }
    } else {
      const [{ data: version }, { data: locs }, conceptOk] = await Promise.all([
        supabase.from("program_versions").select("id, title, summary, description, source_locale, status, version_no").eq("id", id).maybeSingle(),
        supabase.from("program_localizations").select("locale, title, summary, description, status, updated_at").eq("version_id", id),
        conceptColumnSupported(supabase),
      ]);
      // conceito (0048) em consulta própria: sem a coluna, o editor de tradução segue sem os campos de conceito
      const [{ data: sourceConcept }, { data: locConcepts }] = conceptOk
        ? await Promise.all([
            supabase.from("program_versions").select("concept").eq("id", id).maybeSingle(),
            supabase.from("program_localizations").select("locale, concept").eq("version_id", id),
          ])
        : [{ data: null }, { data: null }];
      if (version) {
        const targets = locales.filter((l) => l !== version.source_locale);
        editor = (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="type-h3 text-fg">{t("versionLabel", { title: version.title, n: version.version_no })}</h2>
              <StatusBadge status={version.status} label={ts(version.status)} />
              <Badge size="sm">{tc(`localeName.${version.source_locale}` as never)}</Badge>
            </div>
            {targets.map((target) => {
              const existing = (locs ?? []).find((l) => l.locale === target) ?? null;
              return (
                <TranslationEditor
                  key={target}
                  kind="program"
                  targetId={version.id}
                  locale={target as LocaleCode}
                  localeLabel={tc(`localeName.${target}` as never)}
                  sourceLocaleLabel={tc(`localeName.${version.source_locale}` as never)}
                  source={{ title: version.title, summary: version.summary, description: version.description, concept: sourceConcept?.concept ?? null }}
                  existing={existing ? { title: existing.title, summary: existing.summary, description: existing.description, concept: (locConcepts ?? []).find((l) => l.locale === target)?.concept ?? null, status: existing.status as "draft" | "published", updated_at: existing.updated_at } : null}
                  conceptSupported={conceptOk}
                  existingLabel={existing ? t("existing", { date: formatDateTime(existing.updated_at, uiLocale) }) : null}
                />
              );
            })}
          </div>
        );
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Panel title={t("noteTitle")}>
        <p className="text-sm text-fg-muted">{t("note")}</p>
      </Panel>

      <form method="get" action="/admin/translations" role="search" aria-label={t("pickKind")} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <KindSwitch kind={kind} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <FormField label={kind === "content" ? t("searchContent") : t("searchProgram")} className="flex-1" id="translation-search">
            <Input type="search" name="q" defaultValue={q} placeholder={tc("searchPlaceholder")} leadingIcon={<Search />} maxLength={80} />
          </FormField>
          <Button type="submit">{tc("search")}</Button>
        </div>
      </form>

      {q && !id && (
        <Panel title={t("results")}>
          {results.length === 0 ? (
            <p className="text-sm text-fg-muted">{tc("noMatches", { q })}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {results.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/translations?kind=${kind}&id=${r.id}`}
                    className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-fg">{r.title}</span>
                      <span className="block truncate text-xs text-fg-muted">{r.subtitle}</span>
                    </span>
                    <StatusBadge status={r.status} label={ts(r.status as never)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {editor ?? (!q ? <p className="text-sm text-fg-muted">{t("choose")}</p> : null)}
    </div>
  );
}

// Seletor conteúdo/programa (links GET, funciona sem JS).
async function KindSwitch({ kind }: { kind: Kind }) {
  const t = await getTranslations("adminContent.translations");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-fg">{t("pickKind")}</span>
      <input type="hidden" name="kind" value={kind} />
      <nav aria-label={t("pickKind")} className="flex gap-1 rounded-xl border border-border bg-surface-elevated p-1">
        {(["content", "program"] as const).map((k) => (
          <Link
            key={k}
            href={`/admin/translations?kind=${k}`}
            aria-current={kind === k ? "page" : undefined}
            className={`inline-flex min-h-9 items-center rounded-lg px-3.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus ${kind === k ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
          >
            {k === "content" ? t("kindContent") : t("kindProgram")}
          </Link>
        ))}
      </nav>
    </div>
  );
}
