import type { Metadata } from "next";
import { Lightbulb } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { PrintButton } from "@/components/project-room/PrintButton";
import { IdeaActions } from "@/components/strategy/IdeaActions";
import { IdeaForm } from "@/components/strategy/IdeaForm";
import { StrategyStatusBadge } from "@/components/strategy/StrategyStatusBadge";
import { EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { requireAgency } from "@/lib/agency/server";
import { strategyAiStatus } from "@/lib/strategy/ai";
import { getStrategyIdea, strategyFormOptions } from "@/lib/strategy/queries";
import { localDay } from "@/lib/today/logic";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("strategy");
  return { title: t("detailTitle") };
}

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ editar?: string }> };

// Estratégia (página e PDF pelo "Salvar como PDF" do navegador): marca, Hero, data do Calendário Groscove e o texto;
// situação, quem aprovou e a oportunidade enviada. Ações conforme o papel (o banco confere).
export default async function StrategyPage({ params, searchParams }: Props) {
  const [ctx, { id }, sp] = await Promise.all([requireAgency(), params, searchParams]);
  const [t, locale, res] = await Promise.all([getTranslations("strategy"), getLocale() as Promise<Locale>, getStrategyIdea(id)]);
  if (!res.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<Lightbulb />} title={t("unavailable")} />
      </div>
    );
  }
  const idea = res.data;
  if (!idea) notFound();
  const editing = sp.editar === "1" && idea.canEdit;
  const opts = editing ? await strategyFormOptions(ctx.agency.id, localDay(new Date(), ctx.agency.timezone || "America/Sao_Paulo")) : null;
  const rows: [string, string | null][] = [
    [t("fields.brand"), idea.brand || idea.brandLabel || null],
    [t("fields.hero"), idea.talent],
    [t("fields.segment"), idea.segment],
    [t("fields.event"), idea.event ? `${idea.event}${idea.eventOn ? ` · ${formatPlainDate(idea.eventOn, locale)}` : ""}` : null],
    [t("fields.date"), idea.ideaOn ? formatPlainDate(idea.ideaOn, locale) : null],
    [t("fields.month"), formatPlainDate(idea.month, locale, { month: "long", year: "numeric" })],
    [t("fields.author"), idea.authorLabel || null],
    [t("fields.reviewed"), idea.reviewedLabel ? `${idea.reviewedLabel}${idea.reviewedAt ? ` · ${formatDateTime(idea.reviewedAt, locale)}` : ""}` : null],
  ];
  return (
    <div className="flex flex-col gap-5" data-testid="strategy-detail">
      <PageHeader
        title={idea.title}
        description={t("detailHint")}
        backHref={`/agencia/estrategias?mes=${idea.month.slice(0, 7)}`}
        backLabel={t("title")}
        actions={<div className="print:hidden">{idea.status !== "idea" ? <PrintButton /> : null}</div>}
      />
      <div className="flex flex-wrap items-center gap-2">
        <StrategyStatusBadge status={idea.status} />
        {idea.aiAssisted ? <span className="type-caption text-fg-muted">{t("aiAssisted")}</span> : null}
      </div>
      {idea.status === "idea" && idea.reviewNote ? (
        <p className="rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-body-sm text-fg" data-testid="strategy-returned">
          {t("returnedNote", { note: idea.reviewNote })}
        </p>
      ) : null}
      {editing && opts ? (
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <IdeaForm
            initial={{
              id: idea.id,
              month: idea.month,
              brandId: idea.brandId ?? "",
              brandLabel: idea.brandLabel,
              segmentId: idea.segmentId ?? "",
              talentId: idea.talentId ?? "",
              calendarEventId: idea.calendarEventId ?? "",
              ideaOn: idea.ideaOn ?? "",
              title: idea.title,
              body: idea.body,
            }}
            brands={opts.brands}
            segments={opts.segments}
            talents={opts.talents}
            events={opts.events}
            aiStatus={strategyAiStatus()}
          />
        </section>
      ) : (
        <article className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <dl className="grid gap-3 sm:grid-cols-2">
            {rows
              .filter(([, value]) => Boolean(value))
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="type-caption text-fg-muted">{label}</dt>
                  <dd className="text-sm text-fg">{value}</dd>
                </div>
              ))}
          </dl>
          {idea.body ? <p className="whitespace-pre-line text-sm text-fg">{idea.body}</p> : <p className="type-body-sm text-fg-muted">{t("noBody")}</p>}
          {idea.sponsorshipId ? (
            <p className="text-sm text-fg">
              {t("sponsorship")}{" "}
              <Link href={`/agencia/oportunidades/${idea.sponsorshipId}`} className="font-medium text-accent-text underline-offset-2 hover:underline print:no-underline">
                {idea.sponsorship ?? "—"}
              </Link>
              {idea.sentAt ? ` · ${t("sentOn", { date: formatDateTime(idea.sentAt, locale) })}` : ` · ${t("draftSponsorship")}`}
            </p>
          ) : null}
          {idea.canEdit ? (
            <Link href={`/agencia/estrategias/${idea.id}?editar=1`} className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-accent-text underline-offset-2 hover:underline print:hidden" data-testid="strategy-edit">
              {t("edit")}
            </Link>
          ) : null}
        </article>
      )}
      <IdeaActions idea={idea} />
    </div>
  );
}
