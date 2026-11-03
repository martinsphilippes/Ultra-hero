import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandCallControls } from "@/components/brand-call/BrandCallControls";
import { BrandCallProposals } from "@/components/brand-call/BrandCallProposals";
import { CallSummary } from "@/components/brand-call/CallSummary";
import { CallStatusBadge } from "@/components/brand-call/shared";
import { Badge, Button, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { callBrandControls } from "@/lib/brand-call/logic";
import { getBrandCall } from "@/lib/brand-call/queries";
import { getBrandContext } from "@/lib/brand-portal/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandCall.meta");
  return { title: t("call") };
}

type Props = { params: Promise<{ id: string }> };

// Chamada da marca (0089), lado da marca: resumo, rascunho/aprovação interna, quem vê e as propostas recebidas lado a
// lado com a negociação e a escolha das vencedoras. Só as propostas ENVIADAS pelas agências aparecem.
export default async function BrandCallPage({ params }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const { id } = await params;
  const [t, locale, detail] = await Promise.all([getTranslations("brandCall.brand"), getLocale() as Promise<Locale>, getBrandCall(id)]);
  if (!detail) notFound();
  const { call } = detail;
  const can = callBrandControls({ status: call.status, approval: call.approval, decidedAt: call.decidedAt }, detail.role);
  return (
    <div className="flex flex-col gap-5" data-testid="brand-call-page">
      <PageHeader
        title={call.title}
        backHref="/marca/oportunidades?aba=chamadas"
        backLabel={t("title")}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <CallStatusBadge status={call.status} closedReason={call.closedReason} />
            {call.publishedAt ? <span className="text-fg-muted">{t("publishedAt", { date: formatDateTime(call.publishedAt, locale) })}</span> : null}
          </span>
        }
        actions={
          can.edit ? (
            <Button asChild size="sm" variant="secondary" leadingIcon={<Pencil />}>
              <Link href={`/marca/oportunidades/chamadas/${call.id}/editar`} data-testid="brand-call-edit">
                {t("edit")}
              </Link>
            </Button>
          ) : null
        }
      />
      <BrandCallControls detail={detail} />
      {call.decidedAt ? (
        <p className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 type-body-sm text-fg" data-testid="brand-call-decided">
          {t(`decided.${call.status === "contracted" ? "contracted" : call.status === "cancelled" ? "cancelled" : "closed"}`)}
          {call.decisionNote ? ` “${call.decisionNote}”` : ""}
        </p>
      ) : call.status === "closed" ? (
        <p className="rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 type-body-sm text-fg">{t("deadlineHint")}</p>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-3">
          <CallSummary call={call} budget="values" />
          <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4" data-testid="brand-call-audience">
            <h2 className="text-sm font-semibold text-fg">{t("whoSees")}</h2>
            <p className="type-body-sm text-fg-muted">{t(`audience.${call.audience}`)}</p>
            {call.audience === "selected" ? (
              <div className="flex flex-wrap gap-1.5">
                {detail.targets.map((a) => (
                  <Badge key={a.id} size="sm" variant="neutral">
                    {a.name}
                  </Badge>
                ))}
              </div>
            ) : null}
          </section>
        </div>
        {call.status !== "draft" ? <BrandCallProposals detail={detail} /> : null}
      </div>
    </div>
  );
}
