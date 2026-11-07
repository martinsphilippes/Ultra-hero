import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, Badge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate, formatDateTime } from "@/i18n/format";
import { loadActionAnswers } from "@/lib/creator-guide/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creatorGuide.meta");
  return { title: t("answers") };
}

type Props = { params: Promise<{ key: string }> };

// Respostas de uma ação do casting (0136), ex.: Black Friday 2026 — quem tem interesse primeiro. Responder não
// confirma participação: a equipe formaliza marca a marca, por e-mail.
export default async function ActionAnswersPage({ params }: Props) {
  const { key } = await params;
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(key)) notFound();
  const [t, locale, data] = await Promise.all([getTranslations("creatorGuide"), getLocale() as Promise<Locale>, loadActionAnswers(key)]);
  if (!data) notFound();
  const count = (i: string) => data.answers.filter((a) => a.interest === i).length;
  return (
    <div className="flex flex-col gap-5" data-testid="action-answers">
      <PageHeader
        title={t("teamView.answersTitle", { title: data.action.title })}
        description={t("teamView.answersLead")}
        backHref="/agencia/casting"
        backLabel={t("meta.answers")}
      />
      <p className="flex flex-wrap items-center gap-2 type-body-sm text-fg">
        <Badge variant="success">{t("teamView.answersCount", { yes: count("yes"), depends: count("depends"), no: count("no") })}</Badge>
        <span className="type-caption text-fg-muted">{t("actions.until", { date: formatDate(data.action.ends_on, locale) })}</span>
      </p>
      {data.answers.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("teamView.noAnswers")}</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {data.answers.map((a) => (
            <li key={a.talent_id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4" data-testid="action-answer">
              <div className="flex items-center gap-3">
                <Avatar src={a.photo_url} name={a.name} size="md" alt="" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{a.name}</p>
                  <p className="type-caption text-fg-muted">{formatDateTime(a.updated_at, locale)}</p>
                </div>
                <Badge size="sm" variant={a.interest === "yes" ? "success" : a.interest === "depends" ? "warning" : "neutral"}>
                  {t(`actions.interest.${a.interest}`)}
                </Badge>
              </div>
              {a.categories ? <p className="type-body-sm text-fg">{`${t("actions.categories")}: ${a.categories}`}</p> : null}
              {a.availability ? <p className="type-body-sm text-fg">{`${t("actions.availability")}: ${a.availability}`}</p> : null}
              {a.notes ? <p className="type-body-sm text-fg-muted">{a.notes}</p> : null}
              <Link href={`/agencia/casting/${a.talent_id}/relacionamento`} className="w-fit type-caption font-semibold text-accent-text underline-offset-4 hover:underline">
                {t("teamView.openTalent")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
