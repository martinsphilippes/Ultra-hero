import { ExternalLink, FileText, Lightbulb } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { RoadmapProgress } from "@/components/roadmap/RoadmapProgress";
import { Badge, buttonBase, buttonSizes, buttonVariants } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate, formatNumber, formatPlainDate } from "@/i18n/format";
import { suggestNextDeal } from "@/lib/project-room/next-deal";
import type { Clipping } from "@/lib/project-room/queries";
import { engagementRate } from "@/lib/project-room/vocab";
import { cn } from "@/lib/utils";
import { FeedbackForm } from "./FeedbackForm";
import { GuideButton } from "./GuideButton";
import { PrintButton } from "./PrintButton";

type Props = { clip: Clipping; /** link "Abrir negócio" com os dados preenchidos (só a agência) */ newDealHref?: string | null };

// Clipping do projeto (0110, D11): página imprimível (o PDF é o "Salvar como PDF" do navegador) com entregas, links
// publicados, métricas mais recentes (0083), equipe, prévias aprovadas, guia de uso, diárias e andamento. Sem valores.
// No fim, a sugestão de próximo negócio; para o cliente, a pesquisa de satisfação pendente.
export async function ClippingView({ clip, newDealHref }: Props) {
  const [t, tk, tn, locale] = await Promise.all([
    getTranslations("projectRoom.clipping"),
    getTranslations("commercial.deliverableKinds"),
    getTranslations("mediaKit.networks"),
    getLocale() as Promise<Locale>,
  ]);
  const rate = engagementRate(clip.totals.engagement, clip.totals.reach, clip.totals.views);
  const next = suggestNextDeal({ serviceSlug: clip.serviceSlug, talent: clip.talent, brand: clip.brand, engagementRate: rate, published: clip.totals.published });
  const pending = clip.side === "agency" ? [] : clip.feedback.filter((f) => f.answeredAt === null);
  const answered = clip.feedback.filter((f) => f.answeredAt !== null && f.score !== null);
  const card = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 print:break-inside-avoid print:border-neutral-300";
  const client = [clip.brand, clip.talent].filter(Boolean).join(" · ");
  const nk = (k: string) => (["post", "reels", "stories", "video", "short", "live", "event", "ugc", "other"].includes(k) ? tk(k) : k);

  return (
    <div className="flex flex-col gap-5" data-testid="clipping">
      <header className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <span className="type-caption font-semibold uppercase tracking-[0.2em] text-accent-text">{t("brandLine", { agency: clip.agency })}</span>
        <h2 className="text-xl font-bold text-fg">{clip.title}</h2>
        <p className="type-body-sm text-fg-muted">{[clip.service, client].filter(Boolean).join(" · ")}</p>
        <p className="flex flex-wrap items-center gap-2 type-caption text-fg-muted">
          {clip.startedOn ? <span>{t("started", { date: formatPlainDate(clip.startedOn, locale) })}</span> : null}
          {clip.closedOn ? <span>· {t("closed", { date: formatPlainDate(clip.closedOn, locale) })}</span> : null}
          {clip.frozen ? <Badge size="sm">{t("frozen")}</Badge> : <Badge size="sm" variant="info">{t("live")}</Badge>}
        </p>
        {clip.progress ? <RoadmapProgress progress={clip.progress} compact /> : null}
        <div className="flex flex-wrap gap-2 print:hidden">
          <PrintButton />
        </div>
        <p className="type-caption text-fg-subtle print:hidden">{t("printHint")}</p>
      </header>

      {pending.map((f) => (
        <FeedbackForm key={f.id} portal={clip.side as "brand" | "talent"} dealId={clip.dealId} feedback={f} agency={clip.agency} />
      ))}

      <section className="grid grid-cols-3 gap-2" aria-label={t("numbers")}>
        {[
          { k: "deliverables", v: formatNumber(clip.totals.published || clip.totals.deliverables, locale) },
          { k: "reach", v: clip.totals.reach > 0 ? formatNumber(clip.totals.reach, locale, { notation: "compact" }) : "—" },
          { k: "engagement", v: rate !== null ? `${formatNumber(rate, locale, { maximumFractionDigits: 1 })}%` : "—" },
        ].map((x) => (
          <div key={x.k} className="flex flex-col items-center gap-0.5 rounded-2xl border border-border bg-surface p-3 text-center">
            <span className="text-lg font-bold text-fg">{x.v}</span>
            <span className="type-caption text-fg-muted">{t(`totals.${x.k}`)}</span>
          </div>
        ))}
      </section>

      <section className={card}>
        <h3 className="text-sm font-semibold text-fg">{t("deliverables")}</h3>
        {clip.deliverables.length === 0 ? <p className="type-caption text-fg-muted">{t("noDeliverables")}</p> : null}
        <ul className="flex flex-col divide-y divide-border">
          {clip.deliverables.map((d) => (
            <li key={d.id} className="flex flex-col gap-1 py-2">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-fg">{d.title || nk(d.kind)}</span>
                <Badge size="sm">{nk(d.kind)}</Badge>
                {d.network ? <Badge size="sm">{tn(d.network)}</Badge> : null}
              </span>
              <span className="type-caption text-fg-muted">
                {d.talent}
                {d.publishedAt ? ` · ${t("publishedOn", { date: formatDate(d.publishedAt, locale) })}` : ""}
              </span>
              {d.metrics ? (
                <span className="type-caption text-fg">
                  {(["reach", "views", "likes", "comments", "shares", "saves", "clicks"] as const)
                    .filter((m) => d.metrics?.[m] !== null && d.metrics?.[m] !== undefined)
                    .map((m) => `${t(`metrics.${m}`)}: ${formatNumber(d.metrics?.[m] ?? 0, locale)}`)
                    .join(" · ")}
                </span>
              ) : null}
              {d.publishedUrl ? (
                <a href={d.publishedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 break-all text-sm font-medium text-accent-text underline-offset-2 hover:underline">
                  <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
                  <span className="print:hidden">{t("openLink")}</span>
                  <span className="hidden print:inline">{d.publishedUrl}</span>
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {clip.previews.length > 0 ? (
        <section className={card}>
          <h3 className="text-sm font-semibold text-fg">{t("previews")}</h3>
          <ul className="flex flex-col gap-1">
            {clip.previews.map((p, i) => (
              <li key={`${p.deliverable}:${i}`} className="type-body-sm text-fg">
                {t("previewLine", { title: p.deliverable, n: p.revision })}
                {p.decidedAt ? ` · ${t("approvedOn", { date: formatDate(p.decidedAt, locale) })}` : ""}
                {p.url ? (
                  <>
                    {" · "}
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-text underline-offset-2 hover:underline">
                      {t("openLink")}
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={card}>
        <h3 className="text-sm font-semibold text-fg">{t("guide")}</h3>
        {clip.usageGuide ? (
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="size-5 text-fg-subtle" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm text-fg">{clip.usageGuide.name}</span>
            <GuideButton messageId={clip.usageGuide.messageId} />
          </div>
        ) : (
          <p className="type-caption text-fg-muted">{t("noGuide")}</p>
        )}
        <p className="type-caption text-fg-muted">{t("guideHint")}</p>
      </section>

      <section className={card}>
        <h3 className="text-sm font-semibold text-fg">{t("team")}</h3>
        <ul className="flex flex-wrap gap-1.5">
          {clip.team.map((m, i) => (
            <li key={`${m.name}:${i}`}>
              <Badge size="sm">{`${m.name} · ${m.role === "agency" || m.role === "talent" ? t(`roles.${m.role}`) : m.role}`}</Badge>
            </li>
          ))}
        </ul>
        {clip.shootDays.length > 0 ? (
          <p className="type-caption text-fg-muted">
            {t("shootDays")}: {clip.shootDays.map((d) => `${formatDate(d.startsAt, locale)} · ${d.location}`).join(" | ")}
          </p>
        ) : null}
      </section>

      {clip.side === "agency" && answered.length > 0 ? (
        <section className={card}>
          <h3 className="text-sm font-semibold text-fg">{t("feedback")}</h3>
          <ul className="flex flex-col gap-1">
            {answered.map((f) => (
              <li key={f.id} className="type-body-sm text-fg">
                <Badge size="sm" variant={(f.score ?? 0) >= 9 ? "success" : (f.score ?? 0) >= 7 ? "warning" : "danger"}>
                  {f.score}
                </Badge>{" "}
                {t(`parties.${f.party}`)} · {t(`moments.${f.moment}`)}
                {f.comment ? ` — “${f.comment}”` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={cn(card, "border-accent/40 bg-accent-soft/30")} data-testid="next-deal">
        <h3 className="flex items-center gap-2 type-caption font-semibold uppercase tracking-wider text-accent-text">
          <Lightbulb className="size-4" aria-hidden="true" />
          {t("nextTitle")}
        </h3>
        <p className="text-base font-semibold text-fg">{t(`nextServices.${next.service}`, { talent: clip.talent ?? clip.brand ?? "" })}</p>
        <p className="type-body-sm text-fg-muted">
          {t(`nextReasons.${next.reason}`)}
          {next.strong && rate !== null ? ` ${t("nextStrong", { rate: formatNumber(rate, locale, { maximumFractionDigits: 1 }) })}` : ""}
        </p>
        {clip.side === "agency" && newDealHref ? (
          <Link href={newDealHref} className={cn(buttonBase, buttonVariants.primary, buttonSizes.md, "w-full sm:w-fit print:hidden")} data-testid="next-deal-open">
            {t("nextOpen")}
          </Link>
        ) : (
          <p className="type-caption text-fg-subtle">{t("nextClient", { agency: clip.agency })}</p>
        )}
      </section>
      <p className="type-caption text-fg-subtle">{t("generated", { date: formatDate(clip.generatedAt, locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}</p>
    </div>
  );
}
