import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { briefDefined, type Brief } from "@/lib/brief/brief";

// Leitura do briefing estruturado (0080), igual para agência, marca e influenciador. Sem valores.
export function BriefView({ brief, showEmpty = false }: { brief: Brief; showEmpty?: boolean }) {
  const t = useTranslations("brief");
  if (!briefDefined(brief)) return showEmpty ? <p className="type-caption text-fg-muted">{t("empty")}</p> : null;
  const chips = (items: string[]) => (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <li key={x} className="rounded-full border border-border bg-surface-hover px-2.5 py-0.5 font-mono text-sm text-fg">
          {x}
        </li>
      ))}
    </ul>
  );
  const links = (items: string[]) => (
    <ul className="flex flex-col gap-1">
      {items.map((x) => (
        <li key={x} className="min-w-0">
          <a href={x} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-sm font-medium break-all text-accent-text underline-offset-2 hover:underline">
            <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
            {x}
          </a>
        </li>
      ))}
    </ul>
  );
  const row = (label: string, body: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <dt className="type-caption text-fg-muted">{label}</dt>
      <dd>{body}</dd>
    </div>
  );
  return (
    <dl className="flex flex-col gap-3" data-testid="brief-view">
      {brief.hashtags.length > 0 ? row(t("view.hashtags"), chips(brief.hashtags)) : null}
      {brief.mentions.length > 0 ? row(t("view.mentions"), chips(brief.mentions)) : null}
      {brief.coupon ? row(t("view.coupon"), chips([brief.coupon])) : null}
      {brief.links.length > 0 ? row(t("view.links"), links(brief.links)) : null}
      {brief.references.length > 0 ? row(t("view.references"), links(brief.references)) : null}
      {brief.donts.trim() ? row(t("view.donts"), <p className="whitespace-pre-wrap text-sm text-fg">{brief.donts}</p>) : null}
      {brief.checks.length > 0
        ? row(
            t("view.checks"),
            <ul className="list-disc pl-5 text-sm text-fg">
              {brief.checks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>,
          )
        : null}
    </dl>
  );
}
