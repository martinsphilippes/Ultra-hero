import type { Metadata } from "next";
import { CalendarDays, Lightbulb, Mail, MessageCircle, Orbit, ShieldCheck, Users } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionResponseForm, FormatInterestForm, IdeaSheet } from "@/components/creator-guide/GuideForms";
import { Badge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { FORMAT_KEYS, actionOpen, answeredFormats } from "@/lib/creator-guide/format";
import { loadCreatorGuide } from "@/lib/creator-guide/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creatorGuide.meta");
  return { title: t("title") };
}

// Como trabalhamos (0136): o guia "Direcionamento de Reuniões com Creators" da Groscove Group virou a página do
// creator: os quatro formatos com o que é e o que não é promessa, o interesse em cada um, a ação aberta (Black
// Friday), o projeto autoral, os universos, o media kit, os canais oficiais e os limites. Quem ainda não está num
// casting lê o guia sem os formulários.
const card = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5";

function Section({ id, title, icon, children, lead }: { id: string; title: string; icon?: ReactNode; lead?: string; children: ReactNode }) {
  return (
    <section className={card} aria-labelledby={`${id}-title`} id={id}>
      <h2 id={`${id}-title`} className="flex items-center gap-2 text-lg font-semibold text-fg">
        {icon}
        {title}
      </h2>
      {lead ? <p className="type-body-sm text-fg-muted">{lead}</p> : null}
      {children}
    </section>
  );
}

export default async function HowWeWorkPage() {
  const [t, locale, guide] = await Promise.all([getTranslations("creatorGuide"), getLocale() as Promise<Locale>, loadCreatorGuide()]);
  const today = new Date().toISOString().slice(0, 10);
  const formats = guide?.formats ?? {};
  const pointsOf = (key: string) => Object.entries(t.raw(`formats.items.${key}.points`) as Record<string, string>);
  const limits = Object.entries(t.raw("limits.items") as Record<string, string>);
  const kitItems = Object.entries(t.raw("kit.items") as Record<string, string>);
  const tips = Object.entries(t.raw("tips.items") as Record<string, { title: string; text: string }>);

  return (
    <div className="flex flex-col gap-5" data-testid="how-we-work">
      <PageHeader eyebrow={t("hero.eyebrow")} title={t("hero.title")} description={t("hero.lead")} />

      <section className="flex flex-col gap-2 rounded-2xl bg-accent-soft p-4 sm:p-5" aria-label={t("hero.title")}>
        <p className="type-body-sm text-fg">{t("hero.moment")}</p>
        {!guide ? <p className="type-body-sm font-semibold text-fg">{t("notInCasting")}</p> : null}
      </section>

      <Section id="equipe" title={t("team.title")} icon={<Users className="size-5 text-accent-text" aria-hidden="true" />}>
        <p className="type-body-sm text-fg">{t("team.body")}</p>
      </Section>

      <section className="flex flex-col gap-3" aria-labelledby="formatos-title" id="formatos">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h2 id="formatos-title" className="text-lg font-semibold text-fg">
              {t("formats.title")}
            </h2>
            <p className="type-body-sm text-fg-muted">{t("formats.lead")}</p>
          </div>
          {guide ? (
            <Badge variant={answeredFormats(formats) === 4 ? "success" : "neutral"} size="sm">
              {t("formats.progress", { count: answeredFormats(formats) })}
            </Badge>
          ) : null}
        </div>
        <ol className="grid gap-3 lg:grid-cols-2">
          {FORMAT_KEYS.map((key) => (
            <li key={key} className={card} id={key === "project" ? "projeto-autoral" : `formato-${key}`} data-testid={`format-${key}`}>
              <p className="type-caption font-semibold uppercase tracking-wide text-accent-text">{t(`formats.items.${key}.label`)}</p>
              <h3 className="text-base font-semibold text-fg">{t(`formats.items.${key}.title`)}</h3>
              <p className="type-body-sm text-fg">{t(`formats.items.${key}.summary`)}</p>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 type-body-sm text-fg">
                {pointsOf(key).map(([k, text]) => (
                  <li key={k}>{text}</li>
                ))}
              </ul>
              <p className="rounded-xl border-l-4 border-warning bg-warning-soft px-3 py-2 type-body-sm text-fg">
                <strong className="font-semibold">{t("formats.importantLabel")}: </strong>
                {t(`formats.items.${key}.important`)}
              </p>
              {guide ? <FormatInterestForm formatKey={key} initial={formats[key] ?? null} /> : null}
              {guide && key === "project" ? (
                <div className="flex flex-col gap-2 border-t border-border pt-3">
                  <p className="text-sm font-semibold text-fg">{t("idea.title")}</p>
                  <p className="type-caption text-fg-muted">{t("idea.lead")}</p>
                  <IdeaSheet />
                  {guide.ideas.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <p className="type-caption font-semibold text-fg-muted">{t("idea.mine")}</p>
                      <ul className="flex flex-col gap-2" data-testid="my-ideas">
                        {guide.ideas.map((i) => (
                          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-fg">{i.title}</span>
                              <span className="type-caption text-fg-muted">{t("idea.sentOn", { date: formatDate(i.created_at, locale) })}</span>
                            </span>
                            <Badge size="sm" variant={i.status === "prospecting" ? "success" : i.status === "closed" ? "neutral" : "info"}>
                              {t(`idea.status.${i.status}`)}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {guide && guide.actions.some((a) => actionOpen(a, today)) ? (
        guide.actions
          .filter((a) => actionOpen(a, today))
          .map((a) => (
            <Section key={a.key} id={`acao-${a.key}`} title={`${t("actions.title")}: ${a.title}`} icon={<CalendarDays className="size-5 text-accent-text" aria-hidden="true" />}>
              <p className="type-body-sm text-fg">{a.summary}</p>
              <p className="flex flex-wrap items-center gap-2 type-caption text-fg-muted">
                <span>{t("actions.until", { date: formatDate(a.ends_on, locale) })}</span>
                {a.event_id ? (
                  <Link href={`/heroi/agenda/groscove/${a.event_id}`} className="font-semibold text-accent-text underline-offset-4 hover:underline">
                    {t("actions.calendar")}
                  </Link>
                ) : null}
              </p>
              {a.response ? (
                <p className="type-body-sm font-semibold text-fg">{t("actions.answered", { interest: t(`actions.interest.${a.response.interest}`) })}</p>
              ) : null}
              <ActionResponseForm actionKey={a.key} initial={a.response} />
              <p className="type-caption text-fg-muted">{t("actions.disclaimer")}</p>
            </Section>
          ))
      ) : null}

      <Section id="conteudo" title={t("tips.title")} lead={t("tips.lead")} icon={<Lightbulb className="size-5 text-accent-text" aria-hidden="true" />}>
        <dl className="grid gap-3 sm:grid-cols-2">
          {tips.map(([k, tip]) => (
            <div key={k} className="flex flex-col gap-1 rounded-xl border border-border p-3">
              <dt className="text-sm font-semibold text-fg">{tip.title}</dt>
              <dd className="type-body-sm text-fg-muted">{tip.text}</dd>
            </div>
          ))}
        </dl>
        <p className="type-body-sm text-fg">{t("tips.calendar")}</p>
      </Section>

      <Section id="universos" title={t("universes.title")} icon={<Orbit className="size-5 text-accent-text" aria-hidden="true" />}>
        <p className="type-body-sm text-fg">{t("universes.body")}</p>
        <p className="type-caption text-fg-muted">{t("universes.note")}</p>
        {guide ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/heroi/universos"
              className="inline-flex min-h-11 items-center rounded-(--uh-btn-radius-md) border border-border-strong bg-surface-elevated px-4 text-sm font-semibold text-fg hover:bg-surface-hover"
            >
              {t("universes.open")}
            </Link>
            <span className="type-caption text-fg-muted">
              {t("universes.summary", { universes: guide.universes.length, brands: guide.brandsKnown.length + guide.brandsExplore.length })}
            </span>
          </div>
        ) : null}
      </Section>

      <Section id="media-kit" title={t("kit.title")} lead={t("kit.lead")}>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 type-body-sm text-fg">
          {kitItems.map(([k, text]) => (
            <li key={k}>{text}</li>
          ))}
        </ul>
        <p className="type-body-sm text-fg">{t("kit.registration")}</p>
        <p className="flex items-start gap-2 type-caption text-fg-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("kit.privacy")}
        </p>
        {guide ? (
          <Link
            href="/heroi/media-kit"
            className="inline-flex min-h-11 w-fit items-center rounded-(--uh-btn-radius-md) border border-border-strong bg-surface-elevated px-4 text-sm font-semibold text-fg hover:bg-surface-hover"
          >
            {t("kit.open")}
          </Link>
        ) : null}
      </Section>

      <Section id="canais" title={t("channels.title")}>
        <ul className="flex flex-col gap-2 type-body-sm text-fg">
          <li className="flex items-start gap-2">
            <Mail className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
            {t("channels.email")}
          </li>
          <li className="flex items-start gap-2">
            <MessageCircle className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
            {t("channels.whatsapp")}
          </li>
          <li className="flex items-start gap-2">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
            {t("channels.portal")}
          </li>
        </ul>
      </Section>

      <Section id="limites" title={t("limits.title")}>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 type-body-sm text-fg">
          {limits.map(([k, text]) => (
            <li key={k}>{text}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
