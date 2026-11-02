import type { Metadata } from "next";
import { Columns3, Star } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { AudienceBars } from "@/components/talent/AudienceBars";
import { Avatar, Button, EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { getBrandContext } from "@/lib/brand-portal/server";
import { localDay } from "@/lib/today/logic";
import { availabilityWindow, canCompare, formatAvg, onTimePct, parseCompareIds } from "@/lib/selection/logic";
import { compareTalents, type CompareCard } from "@/lib/selection/queries";
import { formatCount, pickAudience, type KitNetwork } from "@/lib/talent/media-kit";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("selection.meta");
  return { title: t("compare") };
}

type Props = { searchParams: Promise<{ ids?: string | string[] }> };

// Comparar 2 a 4 creators do catálogo autorizado (0081), lado a lado: público, nicho, agenda declarada nos próximos
// 60 dias, redes e seguidores, nota média e campanhas com a marca. Valor: a regra do catálogo é não mostrar (a
// proposta comercial é com a agência). No celular, as colunas rolam na horizontal dentro do quadro.
export default async function ComparePage({ searchParams }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const ids = parseCompareIds((await searchParams).ids);
  const [t, tn, tr, locale] = await Promise.all([getTranslations("selection.compare"), getTranslations("mediaKit.networks"), getTranslations("selection.rating"), getLocale() as Promise<Locale>]);
  const result = canCompare(ids) ? await compareTalents(ctx.brand.id, ids) : { available: true, items: [] as CompareCard[] };
  const items = result.items;
  const missing = canCompare(ids) ? ids.length - items.length : 0;
  const today = localDay(new Date(), "America/Sao_Paulo");

  const header = <PageHeader title={t("title")} description={t("description")} backHref="/marca/creators" backLabel={t("back")} />;
  if (!result.available || items.length < 2) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<Columns3 />}
            title={result.available ? t("needMore") : t("unavailable")}
            description={missing > 0 ? t("missing", { count: missing }) : undefined}
            action={
              <Button asChild>
                <Link href="/marca/creators">{t("back")}</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const none = <span className="type-body-sm text-fg-muted">{t("notInformed")}</span>;
  const rows: {
    key: string;
    label: string;
    cell: (c: CompareCard) => ReactNode;
  }[] = [
    {
      key: "audience",
      label: t("rows.audience"),
      cell: (c) => {
        const a = pickAudience((c.networks ?? []) as KitNetwork[]);
        return a ? <AudienceBars audience={a.audience} /> : none;
      },
    },
    {
      key: "states",
      label: t("rows.states"),
      cell: (c) => {
        const a = pickAudience((c.networks ?? []) as KitNetwork[]);
        const states = a?.audience.top_states ?? [];
        return states.length > 0 ? <span className="text-sm text-fg">{states.join(", ")}</span> : none;
      },
    },
    {
      key: "location",
      label: t("rows.location"),
      cell: (c) => (c.city || c.state ? <span className="text-sm text-fg">{[c.city, c.state].filter(Boolean).join(" · ")}</span> : none),
    },
    {
      key: "segments",
      label: t("rows.segments"),
      cell: (c) => ((c.segments ?? []).length > 0 ? <span className="text-sm text-fg">{(c.segments ?? []).map((s) => s.name).join(", ")}</span> : none),
    },
    {
      key: "availability",
      label: t("rows.availability"),
      cell: (c) => {
        const w = availabilityWindow(c.periods, today);
        if (w.available === 0 && w.blocked === 0) return <span className="type-body-sm text-fg-muted">{t("undeclared")}</span>;
        return (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-fg">
              {t("availabilityDays", {
                available: w.available,
                blocked: w.blocked,
              })}
            </span>
            <ul className="flex flex-col gap-0.5">
              {c.periods.map((p, i) => (
                <li key={`${p.startsOn}-${i}`} className={`type-caption ${p.kind === "blocked" ? "text-danger" : "text-success"}`}>
                  {formatPlainDate(p.startsOn, locale)} – {formatPlainDate(p.endsOn, locale)}
                </li>
              ))}
            </ul>
          </div>
        );
      },
    },
    {
      key: "networks",
      label: t("rows.networks"),
      cell: (c) =>
        (c.networks ?? []).length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {(c.networks ?? []).map((n) => (
              <li key={`${n.network}-${n.handle}`} className="text-sm text-fg">
                {tn(n.network)} · <span className="font-mono font-semibold">{formatCount(n.followers, locale) ?? "—"}</span>
              </li>
            ))}
          </ul>
        ) : (
          none
        ),
    },
    {
      key: "value",
      label: t("rows.value"),
      cell: () => <span className="type-body-sm text-fg-muted">{t("valueRule")}</span>,
    },
    {
      key: "rating",
      label: t("rows.rating"),
      cell: (c) =>
        c.rating.count > 0 ? (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1 text-sm font-semibold text-fg">
              <Star className="size-4 fill-accent text-accent" aria-hidden="true" />
              {t("ratingValue", {
                avg: formatAvg(c.rating.avg, locale) ?? "—",
                count: c.rating.count,
              })}
            </span>
            <span className="type-caption text-fg-muted">{t("onTime", { pct: onTimePct(c.rating) ?? 0 })}</span>
          </div>
        ) : (
          <span className="type-body-sm text-fg-muted">{t("noRating")}</span>
        ),
    },
    {
      key: "campaigns",
      label: t("rows.campaigns"),
      cell: (c) => <span className="text-sm text-fg">{t("campaignsCount", { count: c.rating.campaigns })}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {header}
      {missing > 0 ? <p className="rounded-xl border border-dashed border-border px-3 py-2 type-body-sm text-fg-muted">{t("missing", { count: missing })}</p> : null}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" data-testid="compare-table">
        <table style={{ minWidth: `${8 + items.length * 13}rem` }} className="w-full table-fixed border-separate border-spacing-0 rounded-2xl border border-border bg-surface text-left">
          <caption className="sr-only">{t("title")}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-32 border-b border-border p-3 type-caption text-fg-muted sm:w-40">
                <span className="sr-only">{tr("title")}</span>
              </th>
              {items.map((c) => (
                <th key={c.id} scope="col" className="border-b border-border p-3 align-top">
                  <Link href={`/marca/creators/${c.id}`} className="flex flex-col items-start gap-2 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                    <Avatar src={c.photoUrl ?? null} name={c.name} size="md" alt="" />
                    <span className="text-sm font-semibold break-words text-fg">{c.name}</span>
                    <span className="type-caption font-medium text-accent-text">{t("seeProfile")}</span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} data-testid={`compare-row-${r.key}`}>
                <th scope="row" className="border-b border-border p-3 align-top type-caption font-semibold text-fg-muted">
                  {r.label}
                </th>
                {items.map((c) => (
                  <td key={c.id} className="border-b border-border p-3 align-top">
                    {r.cell(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
