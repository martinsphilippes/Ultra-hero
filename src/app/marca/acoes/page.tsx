import type { Metadata } from "next";
import { KanbanSquare } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { StageBoard, type StageCard } from "@/components/today/StageBoard";
import { EmptyState, PageHeader, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { getBrandContext } from "@/lib/brand-portal/server";
import { BOARD_STAGES, buildBrandBoard, type BoardItem, type BoardStage } from "@/lib/today/logic";
import { getBrandWorkboard } from "@/lib/today/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("today.meta");
  return { title: t("board") };
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  planned: "neutral",
  in_production: "info",
  changes_requested: "warning",
  approved: "success",
  submitted: "accent",
  published: "success",
  proof_submitted: "success",
  done: "success",
  proposed: "info",
  contracted: "success",
};

// Painel de ações por etapa (marca): cada entregável de cada creator mostrado à marca, em cada campanha,
// em 5 etapas (Enviada → Aceita → Em criação → Aguardando aprovação → Publicada). Cada cartão abre a campanha.
export default async function BrandBoardPage() {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const [t, tc, locale, wb] = await Promise.all([getTranslations("today.board"), getTranslations("commercial"), getLocale() as Promise<Locale>, getBrandWorkboard(ctx.brand.id)]);

  if (!wb.available || !wb.data) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t("title")} description={t("description")} />
        <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
          <EmptyState icon={<KanbanSquare />} title={t("unavailable")} />
        </div>
      </div>
    );
  }
  const tz = wb.data.timezone;
  const board = buildBrandBoard(wb.data);

  const toCard = (i: BoardItem): StageCard => {
    const date = i.date ? (/^\d{4}-\d{2}-\d{2}$/.test(i.date) ? formatPlainDate(i.date, locale) : formatDateTime(i.date, locale, tz)) : null;
    if (i.type === "campaign") {
      return {
        key: i.key, href: i.href, title: i.campaignTitle || t("untitled"),
        subtitle: [i.talentName, i.requestedCount > 0 ? t("requested", { count: i.requestedCount }) : null].filter(Boolean).join(" · "),
        meta: date ? t("sentAt", { date }) : null,
        badge: i.status ? { label: tc(`brandStatus.${i.status}`), variant: "info" } : null,
      };
    }
    if (i.type === "talent") {
      return {
        key: i.key, href: i.href, title: i.talentName ?? "", subtitle: i.campaignTitle, meta: t("noDeliverables"),
        badge: i.status ? { label: tc(`talentStatus.${i.status}`), variant: STATUS_VARIANT[i.status] ?? "neutral" } : null,
      };
    }
    const kind = i.deliverableKind ? tc(`deliverableKinds.${i.deliverableKind}`) : "";
    return {
      key: i.key, href: i.href, title: i.title || kind,
      subtitle: [i.talentName, i.campaignTitle].filter(Boolean).join(" · "),
      meta: [i.title ? kind : null, date ? t("dateLabel", { date }) : null].filter(Boolean).join(" · ") || null,
      badge: i.status ? { label: tc(`deliverableStatus.${i.status}`), variant: STATUS_VARIANT[i.status] ?? "neutral" } : null,
    };
  };
  const columns = Object.fromEntries(BOARD_STAGES.map((s) => [s, board[s].map(toCard)])) as Record<BoardStage, StageCard[]>;
  const total = BOARD_STAGES.reduce((n, s) => n + columns[s].length, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("description")} />
      {total === 0 ? (
        <div className="rounded-2xl border border-border bg-surface" data-testid="board-empty">
          <EmptyState icon={<KanbanSquare />} title={t("emptyAll")} />
        </div>
      ) : (
        <StageBoard stages={BOARD_STAGES} columns={columns} />
      )}
    </div>
  );
}
