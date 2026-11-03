import { ArrowDownRight, ArrowUpRight, Building2, Store } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { formatCents } from "@/lib/deals/schemas";
import { perksDiff, priceDiff, publicChips, type ProposalBadge, type SponsorshipPublic } from "@/lib/sponsorship/negotiation";
import type { NegotiationRound } from "@/lib/sponsorship/vocab";

// Negociação do patrocínio (0088): selo da proposta, valor com a diferença em relação ao pedido, chips do público e
// a linha do tempo das rodadas (quem, quando, valor — só para quem lê valor —, contrapartidas e nota). Serve à marca
// e à agência; o creator nunca recebe rodadas.

const BADGE_VARIANT: Record<ProposalBadge, BadgeVariant> = {
  waitingOwner: "warning",
  waitingAgency: "info",
  waitingBrand: "warning",
  agreed: "accent",
  declined: "neutral",
  closed: "neutral",
};

export function ProposalBadgeView({ badge, viewer }: { badge: ProposalBadge; viewer: "brand" | "agency" }) {
  const t = useTranslations("sponsorship.negotiation.badge");
  return (
    <Badge size="sm" variant={BADGE_VARIANT[badge]} data-testid="proposal-badge" data-badge={badge}>
      {t(`${viewer}.${badge}`)}
    </Badge>
  );
}

/** "R$ 9.000,00" e, havendo pedido, "−10% (−R$ 1.000,00) do pedido". */
export function MoneyWithDiff({ cents, askedCents, size = "md" }: { cents: number; askedCents: number | null; size?: "md" | "lg" }) {
  const t = useTranslations("sponsorship.negotiation");
  const locale = useLocale() as Locale;
  const diff = priceDiff(askedCents, cents);
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5" data-testid="money-with-diff">
      <span className={size === "lg" ? "text-lg font-semibold text-fg" : "text-sm font-semibold text-fg"}>{formatCents(cents, locale)}</span>
      {diff && diff.cents !== 0 ? <DiffText cents={diff.cents} pct={diff.pct} /> : diff ? <span className="type-caption text-fg-muted">{t("diffSame")}</span> : null}
    </span>
  );
}

export function DiffText({ cents, pct }: { cents: number; pct: number }) {
  const t = useTranslations("sponsorship.negotiation");
  const locale = useLocale() as Locale;
  const up = cents > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const pctText = `${up ? "+" : "−"}${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Math.abs(pct))}%`;
  return (
    <span className={`inline-flex items-center gap-0.5 type-caption font-medium ${up ? "text-success" : "text-warning"}`} data-testid="price-diff">
      <Icon className="size-3.5" aria-hidden="true" />
      {t("diff", { pct: pctText, amount: `${up ? "+" : "−"}${formatCents(Math.abs(cents), locale)}` })}
    </span>
  );
}

export function PublicChips({ value, label }: { value: SponsorshipPublic | null; label?: string }) {
  const chips = publicChips(value);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="public-chips">
      {label ? <span className="type-caption text-fg-muted">{label}:</span> : null}
      {chips.map((c) => (
        <Badge key={c} size="sm" variant="neutral">
          {c}
        </Badge>
      ))}
    </div>
  );
}

type TimelineProps = { rounds: NegotiationRound[]; basePerks: string[]; timeZone: string; viewer: "brand" | "agency"; brandName?: string };

export function NegotiationTimeline({ rounds, basePerks, timeZone, viewer, brandName }: TimelineProps) {
  const t = useTranslations("sponsorship.negotiation");
  const locale = useLocale() as Locale;
  let previous = basePerks;
  return (
    <ol className="flex flex-col gap-3 border-l-2 border-border pl-4" data-testid="negotiation-timeline">
      {rounds.map((r) => {
        const diff = r.perks ? perksDiff(previous, r.perks) : null;
        if (r.perks && r.state === "sent") previous = r.perks;
        const SideIcon = r.side === "agency" ? Building2 : Store;
        const who = r.side === "agency" ? t("sideAgency") : (brandName ?? t("sideBrand"));
        return (
          <li key={r.id} className="relative flex flex-col gap-1.5" data-testid="negotiation-round" data-action={r.action} data-state={r.state}>
            <span className="absolute -left-[1.42rem] top-1 flex size-5 items-center justify-center rounded-full border border-border bg-surface">
              <SideIcon className="size-3 text-accent-text" aria-hidden="true" />
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-fg">{t(`action.${r.action}`)}</span>
              {r.state !== "sent" ? (
                <Badge size="sm" variant={r.state === "pending_owner" ? "warning" : "neutral"}>
                  {t(`roundState.${r.state}`)}
                </Badge>
              ) : null}
            </span>
            <span className="type-caption text-fg-muted">
              {who}
              {r.actorLabel ? ` · ${r.actorLabel}` : ""} · {formatDateTime(r.createdAt, locale, timeZone)}
            </span>
            {r.amountCents !== null ? <span className="text-sm font-semibold text-fg">{formatCents(r.amountCents, locale)}</span> : null}
            {diff && r.action !== "accept" && r.action !== "accept_asked" ? (
              <span className="flex flex-wrap gap-1.5">
                {diff.added.map((p) => (
                  <Badge key={`+${p}`} size="sm" variant="success">
                    + {p}
                  </Badge>
                ))}
                {diff.removed.map((p) => (
                  <Badge key={`-${p}`} size="sm" variant="neutral">
                    <span className="line-through">{p}</span>
                  </Badge>
                ))}
                {diff.added.length === 0 && diff.removed.length === 0 ? <span className="type-caption text-fg-muted">{t("perksSame")}</span> : null}
              </span>
            ) : null}
            {r.audience ? <PublicChips value={r.audience} label={t("audienceOfInterest")} /> : null}
            {r.note ? <p className="whitespace-pre-wrap type-body-sm text-fg">“{r.note}”</p> : null}
            {r.reviewedAt && viewer === "brand" ? (
              <span className="type-caption text-fg-muted">
                {t(r.state === "returned" ? "returnedBy" : "approvedBy", { name: r.reviewedLabel || "—", date: formatDateTime(r.reviewedAt, locale, timeZone) })}
                {r.reviewNote ? ` · “${r.reviewNote}”` : ""}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
