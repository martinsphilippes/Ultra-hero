import type { Metadata } from "next";
import { UserCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { canApproveAccess, getPresidencyQueue } from "@/lib/access/presidency";
import type { QueueItem } from "@/lib/access/status";
import { cn } from "@/lib/utils";
import { DecisionForm } from "./DecisionForm";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("access.meta");
  return { title: t("queue") };
}

type SearchParams = Promise<{ aba?: string }>;

// Fila de aprovação (0141/0144): toda conta nova espera aqui. Abrem a tela a Presidência e os ADMs (admin da plataforma e
// Adm da indústria Groscove); o banco confere de novo a identidade em cada leitura e em cada decisão
// (presidency_access_queue / presidency_access_decide). Vale a primeira decisão; "Decididos" mostra quem decidiu.
export default async function AccessApprovalsPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await canApproveAccess())) redirect("/agencia");
  const { aba } = await searchParams;
  const view = aba === "decididos" ? "decided" : "pending";
  const [t, locale, queue] = await Promise.all([getTranslations("access"), getLocale() as Promise<Locale>, getPresidencyQueue(view)]);

  const tab = (key: "pending" | "decided", href: string, label: string) => (
    <Link
      href={href}
      aria-current={view === key ? "page" : undefined}
      className={cn(
        "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold",
        view === key ? "border-accent bg-accent-soft text-accent-text" : "border-border bg-surface text-fg-muted hover:text-fg",
      )}
      data-testid={`approvals-tab-${key}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-5" data-testid="presidency-approvals">
      <PageHeader title={t("queue.title")} description={t("queue.description")} />
      <p className="type-body-sm text-fg-muted">{t("queue.emailHint")}</p>
      <nav aria-label={t("queue.tabsLabel")} className="flex flex-wrap gap-2">
        {tab("pending", "/agencia/aprovacoes", t("queue.tabPending"))}
        {tab("decided", "/agencia/aprovacoes?aba=decididos", t("queue.tabDecided"))}
      </nav>
      {!queue.available ? (
        <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
          <EmptyState icon={<UserCheck />} title={t("queue.unavailable")} />
        </div>
      ) : queue.items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted" data-testid="approvals-empty">
          {view === "pending" ? t("queue.emptyPending") : t("queue.emptyDecided")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="approvals-list">
          {queue.items.map((item) => (
            <QueueRow key={item.userId} item={item} view={view} t={t} locale={locale} />
          ))}
        </ul>
      )}
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"access">>>;

function QueueRow({ item, view, t, locale }: { item: QueueItem; view: "pending" | "decided"; t: T; locale: Locale }) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="approvals-item" data-user={item.userId}>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-fg">{item.name ?? t("queue.noName")}</span>
          <Badge variant={item.requestedProfile === "hero" ? "accent" : "neutral"} size="sm">
            {t(`profiles.${item.requestedProfile}`)}
          </Badge>
          {view === "decided" ? (
            <Badge variant={item.status === "approved" ? "success" : "danger"} size="sm">
              {item.status === "approved" ? t("queue.statusApproved") : t("queue.statusRejected")}
            </Badge>
          ) : null}
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <span className="break-all type-body-sm text-fg">{item.email ?? "—"}</span>
          {!item.emailVerified ? (
            <Badge variant="warning" size="sm" data-testid="approvals-email-unverified">
              {t("queue.emailUnverified")}
            </Badge>
          ) : null}
        </span>
        <span className="type-caption text-fg-muted">
          {t(`origins.${item.origin}`)}
          {item.requestedAt ? ` · ${t("queue.requestedAt", { date: formatDateTime(item.requestedAt, locale) })}` : ""}
          {!item.profileConfirmed ? ` · ${t("queue.profileUnconfirmed")}` : ""}
        </span>
        {view === "decided" && item.decidedAt ? (
          <span className="type-caption text-fg-muted" data-testid="approvals-decided">
            {t("queue.decidedAt", { status: item.status, date: formatDateTime(item.decidedAt, locale), name: item.decidedByName ?? "—" })}
          </span>
        ) : null}
        {item.decisionNote ? <span className="type-body-sm text-fg">“{item.decisionNote}”</span> : null}
      </div>
      {view === "pending" ? <DecisionForm userId={item.userId} mode="pending" profile={item.requestedProfile} /> : null}
      {view === "decided" && item.status === "rejected" ? <DecisionForm userId={item.userId} mode="rejected" profile={item.requestedProfile} /> : null}
    </li>
  );
}
