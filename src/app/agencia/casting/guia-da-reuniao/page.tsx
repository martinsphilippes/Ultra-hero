import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PrepChecklist } from "@/components/creator-meetings/MeetingButtons";
import { PageHeader } from "@/components/ui";
import { requireAgency } from "@/lib/agency/server";
import { meetingSubject } from "@/lib/creator-guide/format";
import { meetingFileName } from "@/lib/creator-meetings/format";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creatorMeetings.meta");
  return { title: t("guide") };
}

const card = "flex scroll-mt-24 flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5";
const SECTIONS = ["purpose", "image", "opening", "formats", "content", "blackFriday", "questions", "mediaKit", "channels", "script", "limits", "minutes", "after"] as const;
const FORMATS = ["cpa", "publi", "project", "events"] as const;

// Guia da reunião com o Hero (0138): o "Direcionamento de Reuniões" da Groscove Group para a equipe — postura,
// padrão de imagem (checklist antes de entrar), abertura, os quatro formatos, perguntas, media kit, canais,
// roteiro, limites, ata e checklist pós-reunião. Só a equipe da Groscove (e o admin da plataforma) vê.
export default async function MeetingGuidePage() {
  const ctx = await requireAgency("staff");
  if (ctx.agency.slug !== "groscove" && !ctx.platformAdmin) notFound();
  const [t, tc] = await Promise.all([getTranslations("creatorMeetings.guide"), getTranslations("agency.casting")]);
  const keys = (path: string) => Object.keys(t.raw(path) as Record<string, unknown>);
  const list = (path: string, values?: Record<string, string>) => (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 type-body-sm text-fg">
      {keys(path).map((k) => (
        <li key={k}>{t(`${path}.${k}`, values)}</li>
      ))}
    </ul>
  );
  const quote = (text: string) => <blockquote className="border-l-4 border-accent bg-accent-soft/60 px-4 py-3 type-body-sm italic text-fg">{text}</blockquote>;
  const note = (label: string | null, text: string, tone: "accent" | "warning" = "accent") => (
    <p className={tone === "warning" ? "rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 type-body-sm text-fg" : "rounded-xl bg-accent-soft px-3 py-2 type-body-sm text-fg"}>
      {label ? <strong className="font-semibold">{`${label}: `}</strong> : null}
      {text}
    </p>
  );
  const section = (id: (typeof SECTIONS)[number], children: ReactNode) => (
    <section id={`guia-${id}`} className={card} aria-labelledby={`guia-${id}-title`}>
      <h2 id={`guia-${id}-title`} className="text-base font-semibold text-fg">
        {t(`${id}.title`)}
      </h2>
      {children}
    </section>
  );
  const sample = { name: t("sampleName"), date: t("sampleDate") };

  return (
    <div className="flex flex-col gap-4" data-testid="meeting-guide">
      <PageHeader title={t("title")} description={t("lead")} backHref="/agencia/casting" backLabel={tc("title")} />
      <nav aria-label={t("title")} className="flex flex-wrap gap-1.5">
        {SECTIONS.map((id, i) => (
          <a
            key={id}
            href={`#guia-${id}`}
            className="inline-flex min-h-9 items-center rounded-full border border-border-strong bg-surface px-3 text-sm text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {i + 1}
          </a>
        ))}
      </nav>

      {section(
        "purpose",
        <>
          <p className="type-body-sm text-fg">{t("purpose.p1")}</p>
          <p className="type-body-sm text-fg">{t("purpose.p2")}</p>
          {note(null, t("purpose.central"))}
          <h3 className="text-sm font-semibold text-fg">{t("purpose.momentTitle")}</h3>
          {list("purpose.moment")}
        </>,
      )}

      {section(
        "image",
        <>
          <p className="type-body-sm text-fg-muted">{t("image.lead")}</p>
          <PrepChecklist
            label={t("image.title")}
            readyLabel={t("image.ready")}
            items={keys("image.items").map((k) => ({ key: k, title: t(`image.items.${k}.title`), text: t(`image.items.${k}.text`) }))}
          />
          {note(null, t("image.brand"))}
        </>,
      )}

      {section(
        "opening",
        <>
          <h3 className="text-sm font-semibold text-fg">{t("opening.suggested")}</h3>
          {quote(t("opening.quote"))}
          <h3 className="text-sm font-semibold text-fg">{t("opening.structureTitle")}</h3>
          {list("opening.structure")}
          <h3 className="text-sm font-semibold text-fg">{t("opening.institutionalTitle")}</h3>
          {quote(t("opening.institutional"))}
        </>,
      )}

      {section(
        "formats",
        <>
          <p className="type-body-sm text-fg-muted">{t("formats.lead")}</p>
          <ul className="grid gap-3 lg:grid-cols-2">
            {FORMATS.map((f) => (
              <li key={f} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <h3 className="text-sm font-semibold text-fg">{t(`formats.${f}.title`)}</h3>
                <p className="type-body-sm text-fg-muted">{t(`formats.${f}.lead`)}</p>
                {list(`formats.${f}.points`)}
                {note(t("formats.importantLabel"), t(`formats.${f}.important`), "warning")}
              </li>
            ))}
          </ul>
        </>,
      )}

      {section(
        "content",
        <>
          <p className="type-body-sm text-fg-muted">{t("content.lead")}</p>
          {list("content.items")}
          {note(null, t("content.calendar"))}
          <p className="type-body-sm text-fg">{t("content.universes")}</p>
        </>,
      )}

      {section(
        "blackFriday",
        <>
          <p className="type-body-sm text-fg-muted">{t("blackFriday.lead")}</p>
          {quote(t("blackFriday.quote"))}
          {list("blackFriday.points")}
          <Link href="/agencia/casting/acoes/black-friday-2026" className="type-body-sm font-semibold text-accent-text underline-offset-2 hover:underline">
            {t("blackFriday.answers")}
          </Link>
        </>,
      )}

      {section(
        "questions",
        <>
          <p className="type-body-sm text-fg-muted">{t("questions.lead")}</p>
          <dl className="grid gap-3 sm:grid-cols-2">
            {keys("questions.items").map((k) => (
              <div key={k} className="flex flex-col gap-1 rounded-xl border border-border p-3">
                <dt className="text-sm font-semibold text-fg">{t(`questions.items.${k}.title`)}</dt>
                <dd className="type-body-sm text-fg">{t(`questions.items.${k}.text`)}</dd>
              </div>
            ))}
          </dl>
          {note(null, t("questions.noImprovise"), "warning")}
        </>,
      )}

      {section(
        "mediaKit",
        <>
          <p className="type-body-sm text-fg-muted">{t("mediaKit.lead")}</p>
          {list("mediaKit.items")}
          <h3 className="text-sm font-semibold text-fg">{t("mediaKit.registrationTitle")}</h3>
          <p className="type-body-sm text-fg">{t("mediaKit.registration")}</p>
          {note(null, t("mediaKit.sensitive"), "warning")}
        </>,
      )}

      {section("channels", list("channels.items", { subject: meetingSubject(sample.name, sample.date), file: meetingFileName(sample.name, sample.date) }))}

      {section(
        "script",
        <>
          <ol className="grid gap-2 sm:grid-cols-2">
            {keys("script.steps").map((k) => (
              <li key={k} className="flex flex-col gap-1 rounded-xl border border-border p-3">
                <p className="text-sm font-semibold text-fg">{t(`script.steps.${k}.title`)}</p>
                <p className="type-body-sm text-fg">
                  <strong className="font-semibold">{`${t("script.doLabel")}: `}</strong>
                  {t(`script.steps.${k}.do`)}
                </p>
                <p className="type-caption text-fg-muted">
                  <strong className="font-semibold">{`${t("script.recordLabel")}: `}</strong>
                  {t(`script.steps.${k}.record`)}
                </p>
              </li>
            ))}
          </ol>
          {note(null, t("script.tone"))}
        </>,
      )}

      {section("limits", list("limits.items"))}

      {section(
        "minutes",
        <>
          <p className="type-body-sm text-fg">{t("minutes.text")}</p>
          <Link href="/agencia/casting" className="type-body-sm font-semibold text-accent-text underline-offset-2 hover:underline">
            {t("openCasting")}
          </Link>
        </>,
      )}

      {section(
        "after",
        <>
          <p className="type-body-sm text-fg-muted">{t("after.lead")}</p>
          {list("after.items", { file: meetingFileName(sample.name, sample.date), subject: meetingSubject(sample.name, sample.date) })}
        </>,
      )}

      <section className="flex flex-col gap-2 rounded-2xl bg-accent p-4 text-accent-fg sm:p-5" aria-labelledby="guia-principle">
        <h2 id="guia-principle" className="text-base font-semibold">
          {t("principle.title")}
        </h2>
        <p className="type-body-sm">{t("principle.text")}</p>
      </section>
    </div>
  );
}
