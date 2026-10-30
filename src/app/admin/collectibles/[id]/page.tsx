import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyValue, Panel } from "@/components/admin-content";
import { AuctionRoom } from "@/components/collectibles/AuctionRoom";
import { CollectibleControls } from "@/components/collectibles/admin/CollectibleControls";
import { CollectibleForm } from "@/components/collectibles/admin/CollectibleForm";
import { Badge, Button, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/ui/back-link";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { fetchCollectibleViews, PHASE_BADGE } from "@/lib/collectibles/admin";
import { EMPTY_MINE, fetchCollectible, finalizeIfDue, phaseOf } from "@/lib/collectibles/queries";
import { createClient } from "@/lib/supabase/server";

// Detalhe do colecionável no admin: lançar/agendar/cancelar, lances chegando ao vivo, indicadores
// (visualizações e lances, agregados), histórico de ações e o formulário de edição.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("collectibles.admin");
  return { title: t("title") };
}

export default async function AdminCollectiblePage({ params }: Props) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [t, locale, supabase] = await Promise.all([getTranslations("collectibles.admin"), getLocale(), createClient()]);
  let loaded = await fetchCollectible(supabase, id);
  if (!loaded) notFound();
  if (await finalizeIfDue(supabase, loaded.item, true)) loaded = (await fetchCollectible(supabase, id)) ?? loaded;
  const { item } = loaded;
  const [{ data: heroes }, { data: audit }, views] = await Promise.all([
    supabase.from("creator_profiles").select("id, name").order("name"),
    supabase
      .from("admin_audit")
      .select("id, action, justification, created_at")
      .eq("resource_type", "collectible")
      .eq("resource_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    fetchCollectibleViews(supabase, [id]),
  ]);
  const phase = phaseOf(item);
  const started = phase !== "draft" && phase !== "scheduled";
  const locked = started || item.bidsCount > 0;
  const fmt = (iso: string | null) => (iso ? formatDateTime(iso, locale as Locale) : "—");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <BackLink href="/admin/collectibles">{t("title")}</BackLink>
      <PageHeader
        title={item.title}
        eyebrow={
          <Badge variant={PHASE_BADGE[phase] ?? "neutral"} size="sm">
            {t(`phase.${phase}`)}
          </Badge>
        }
        actions={
          phase !== "draft" ? (
            <Button asChild variant="secondary" size="sm" leadingIcon={<ExternalLink />}>
              <Link href={`/shop/colecionaveis/${id}`}>{t("viewPublic")}</Link>
            </Button>
          ) : undefined
        }
      />

      <Panel title={t("statusPanel")}>
        <KeyValue
          items={[
            { label: t("fields.startsAt"), value: fmt(item.startsAt) },
            { label: t("fields.endsAt"), value: fmt(item.endsAt) },
            { label: t("fields.views"), value: String(views.get(id) ?? 0) },
            { label: t("fields.bids"), value: String(item.bidsCount) },
            { label: t("fields.extensions"), value: String(item.extensionsCount) },
            { label: t("fields.winner"), value: item.winnerLabel ?? "—" },
          ]}
        />
        {phase !== "ended" && phase !== "cancelled" ? (
          <CollectibleControls
            id={id}
            canLaunch={(phase === "draft" || phase === "scheduled") && item.bidsCount === 0}
            canCancel
            durationMinutes={item.durationMinutes}
          />
        ) : null}
      </Panel>

      {phase !== "draft" ? (
        <Panel title={t("livePanel")} description={t("livePanelHint")}>
          <AuctionRoom initial={{ item, bids: loaded.bids, mine: EMPTY_MINE }} serverNow={Date.now()} viewer="admin" loginHref="/login" mode="admin" />
        </Panel>
      ) : null}

      <Panel title={t("form.panel")}>
        <CollectibleForm
          id={id}
          heroes={heroes ?? []}
          locked={locked}
          initial={{
            title: item.title,
            description: item.description,
            creator_id: item.creatorId,
            photos: item.photos,
            authenticity_note: item.authenticityNote,
            start_price_cents: item.startPriceCents,
            bid_increments_cents: item.increments,
            duration_minutes: item.durationMinutes,
          }}
        />
      </Panel>

      <Panel title={t("auditPanel")}>
        {(audit ?? []).length === 0 ? (
          <p className="text-sm text-fg-muted">{t("auditEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {(audit ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 last:border-b-0">
                <span className="font-medium text-fg">{t.has(`audit.${a.action}`) ? t(`audit.${a.action}`) : a.action}</span>
                <span className="text-xs text-fg-muted">{fmt(a.created_at)}</span>
                {a.justification ? <span className="w-full text-xs text-fg-muted">{a.justification}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
