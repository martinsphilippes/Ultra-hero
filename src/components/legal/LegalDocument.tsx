import { FlaskConical } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button, PageHeader } from "@/components/ui";
import { formatDate } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { legalLinkClass, legalRichTags } from "./rich-tags";

export type LegalDoc = "terms" | "privacy";

// Versão vigente dos textos. Ao alterar o conteúdo de messages/<locale>/legal.json, atualize a data.
const LAST_UPDATED = "2026-10-29";

// Estrutura de messages/<locale>/legal.json → <doc>.sections.<id>.blocks.<id>:
// string = parágrafo; { caption, headers, rows } = tabela; demais objetos = lista de itens.
type TableBlock = { caption: string; headers: Record<string, string>; rows: Record<string, Record<string, string>> };
type ListBlock = Record<string, string>;
type Block = string | ListBlock | TableBlock;
type Section = { title: string; blocks: Record<string, Block> };

function isTable(block: Block): block is TableBlock {
  return typeof block === "object" && "caption" in block && "headers" in block && "rows" in block;
}

// Documento legal acessível: h1 > h2, sumário com âncoras, listas e tabelas com caption/th scope.
export async function LegalDocument({ doc }: { doc: LegalDoc }) {
  const [t, locale] = await Promise.all([getTranslations("legal"), getLocale()]);
  const sections = Object.entries(t.raw(`${doc}.sections`) as Record<string, Section>);
  const other: LegalDoc = doc === "terms" ? "privacy" : "terms";
  const rich = (key: string) => t.rich(key, legalRichTags);
  const updated = formatDate(`${LAST_UPDATED}T12:00:00Z`, locale);

  const renderBlock = (base: string, id: string, block: Block): ReactNode => {
    const key = `${base}.${id}`;
    if (typeof block === "string") {
      return (
        <p key={id} className="type-body text-fg">
          {rich(key)}
        </p>
      );
    }
    if (isTable(block)) {
      const columns = Object.keys(block.headers);
      const captionId = `${base.replaceAll(".", "-")}-${id}`;
      return (
        <div
          key={id}
          role="region"
          aria-labelledby={captionId}
          tabIndex={0}
          className="overflow-x-auto rounded-xl border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <table className="w-full border-collapse text-left type-body-sm hyphens-auto break-words">
            <caption id={captionId} className="border-b border-border bg-surface px-3 py-3 text-left font-semibold text-fg sm:px-4">
              {t(`${key}.caption`)}
            </caption>
            <thead className="bg-surface-elevated">
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col" className="px-3 py-2.5 align-bottom font-semibold text-fg sm:px-4">
                    {t(`${key}.headers.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(block.rows).map((row) => (
                <tr key={row} className="border-t border-border">
                  {columns.map((column, index) =>
                    index === 0 ? (
                      <th key={column} scope="row" className="px-3 py-3 align-top font-semibold text-fg sm:px-4">
                        {rich(`${key}.rows.${row}.${column}`)}
                      </th>
                    ) : (
                      <td key={column} className="px-3 py-3 align-top text-fg-muted sm:px-4">
                        {rich(`${key}.rows.${row}.${column}`)}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return (
      <ul key={id} className="flex list-disc flex-col gap-2 pl-5 type-body text-fg marker:text-accent">
        {Object.keys(block).map((item) => (
          <li key={item}>{rich(`${key}.${item}`)}</li>
        ))}
      </ul>
    );
  };

  return (
    <article className="flex flex-col gap-8">
      <PageHeader
        eyebrow={t("page.eyebrow")}
        title={t(`${doc}.title`)}
        backHref="/"
        backLabel={t("page.home")}
        description={t.rich("page.updated", {
          date: updated,
          time: (chunks) => <time dateTime={LAST_UPDATED}>{chunks}</time>,
        })}
      />

      <div role="note" aria-labelledby={`${doc}-notice`} className="flex gap-3 rounded-2xl border border-dashed border-warning/40 bg-warning-soft p-4">
        <FlaskConical className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p id={`${doc}-notice`} className="font-semibold text-fg">
            {t("page.noticeTitle")}
          </p>
          <p className="type-body-sm text-fg">{t("page.noticeBody")}</p>
        </div>
      </div>

      <p className="type-body text-fg">{rich(`${doc}.intro`)}</p>

      <nav aria-labelledby={`${doc}-toc`} className="rounded-2xl border border-border bg-surface p-5">
        <p id={`${doc}-toc`} className="type-overline text-fg-muted">
          {t("page.toc")}
        </p>
        <ol className="mt-3 flex list-decimal flex-col gap-1 pl-5 type-body-sm text-fg-muted marker:text-fg-subtle">
          {sections.map(([id]) => (
            <li key={id}>
              <a href={`#${doc}-${id}`} className={legalLinkClass}>
                {t(`${doc}.sections.${id}.title`)}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map(([id, section]) => {
        const base = `${doc}.sections.${id}`;
        return (
          <section key={id} id={`${doc}-${id}`} className="flex scroll-mt-6 flex-col gap-3">
            <h2 className="type-h2 text-fg">{t(`${base}.title`)}</h2>
            {Object.entries(section.blocks).map(([blockId, block]) => renderBlock(`${base}.blocks`, blockId, block))}
          </section>
        );
      })}

      <footer className="flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/legal/${other}`} className={legalLinkClass}>
          {t(`page.read.${other}`)}
        </Link>
        <Button asChild variant="secondary">
          <Link href="/">{t("page.home")}</Link>
        </Button>
      </footer>
    </article>
  );
}
