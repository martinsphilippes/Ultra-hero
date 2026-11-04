import { CalendarDays, ExternalLink, Lightbulb, Newspaper } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { AgendaPost } from "@/lib/editorial/vocab";
import { eventHref, type CulturePortal } from "@/lib/culture/links";

type Props = { post: AgendaPost; portal: CulturePortal };

// Notícia ou dica da Groscove/agência (0101) para quem lê: tipo, autor, data, título, texto (o começo; o resto num
// "ver mais" nativo), imagem e link opcionais e o evento ligado (abre o detalhe na agenda, se a pessoa vê o evento).
export async function PostCard({ post: p, portal }: Props) {
  const [t, locale] = await Promise.all([getTranslations("culture.posts"), getLocale() as Promise<Locale>]);
  const long = p.body.length > 220;
  return (
    <li className="flex flex-col gap-2 overflow-hidden rounded-2xl border border-border bg-surface" data-testid="culture-post" data-kind={p.kind}>
      {p.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.imageUrl} alt={t("imageAlt", { title: p.title })} loading="lazy" className="aspect-[16/9] w-full object-cover" referrerPolicy="no-referrer" />
      ) : null}
      <div className="flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge size="sm" variant={p.kind === "tip" ? "success" : "info"} icon={p.kind === "tip" ? <Lightbulb /> : <Newspaper />}>
            {t(p.kind)}
          </Badge>
          <span className="type-caption text-fg-muted">
            {p.scope === "platform" ? t("groscove") : (p.agencyName ?? "")}
            {p.publishedAt ? ` · ${formatDateTime(p.publishedAt, locale)}` : ""}
          </span>
        </div>
        <h3 className="text-sm font-semibold text-fg">{p.title}</h3>
        {p.body ? (
          long ? (
            <details className="group type-body-sm text-fg">
              <summary className="cursor-pointer list-none whitespace-pre-wrap">
                {p.body.slice(0, 220).trimEnd()}… <span className="font-medium text-accent-text group-open:hidden">+</span>
              </summary>
              <p className="whitespace-pre-wrap">{p.body.slice(220)}</p>
            </details>
          ) : (
            <p className="whitespace-pre-wrap type-body-sm text-fg">{p.body}</p>
          )
        ) : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {p.eventId && p.eventTitle ? (
            <Link href={eventHref(portal, p.eventId)} className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-accent-text underline-offset-2 hover:underline">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {t("aboutEvent", { title: p.eventTitle })}
            </Link>
          ) : null}
          {p.linkUrl ? (
            <a href={p.linkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-accent-text underline-offset-2 hover:underline">
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {t("openLink")}
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}
