import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DeliverablesEditor } from "@/components/deals/DeliverablesEditor";
import { DeliverablesBoard } from "@/components/execution/DeliverablesBoard";
import { MusicPanel } from "@/components/media/MusicPanel";
import { TrackingPanel } from "@/components/media/TrackingPanel";
import { getOrigin } from "@/lib/auth/origin";
import { listDealTalents, listDeliverables } from "@/lib/deals/queries";
import { getDealExecution } from "@/lib/execution/queries";
import { getDealMedia } from "@/lib/media/queries";
import { youTubeConfigured } from "@/lib/media/youtube-collect";
import { createClient } from "@/lib/supabase/server";
import { localDay } from "@/lib/today/logic";
import { loadDeal } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("dealDeliverables") };
}

type Props = { params: Promise<{ id: string }> };

// Entregáveis: antes da contratação, o planejamento por creator; em produção, a execução com versões
// (envio, aprovação da marca, publicação, comprovação e conclusão). A agência pode agir pelo creator sem login.
// 0083: métricas e comentários no segundo em cada entrega, link rastreável/cupom por creator e músicas liberadas.
export default async function DealDeliverablesPage({ params }: Props) {
  const { id } = await params;
  const { ctx, deal, canEdit, isAdmin } = await loadDeal(id);
  const inExecution = deal.stage === "production" || deal.stage === "closed";
  const [t, te, tm, talents, items, exec, docs, media, origin, brandSite] = await Promise.all([
    getTranslations("agency.deal.deliverables"),
    getTranslations("agency.execution"),
    getTranslations("media"),
    listDealTalents(deal.id),
    listDeliverables(deal.id),
    inExecution ? getDealExecution(deal.id) : Promise.resolve({ available: true, data: null }),
    inExecution
      ? (async () => {
          const supabase = await createClient();
          const { data } = await supabase.from("documents").select("id, title").eq("deal_id", deal.id).eq("status", "ready").order("created_at", { ascending: false }).limit(50);
          return (data ?? []).map((d) => ({ id: d.id, title: d.title }));
        })()
      : Promise.resolve([]),
    inExecution ? getDealMedia(deal.id, { sales: isAdmin }) : Promise.resolve(null),
    getOrigin(),
    (async () => {
      const supabase = await createClient();
      const { data } = await supabase.from("brands").select("site_url").eq("id", deal.brand.id).maybeSingle();
      return data?.site_url || null;
    })(),
  ]);
  const today = localDay(new Date(), ctx.agency.timezone || "America/Sao_Paulo");
  const mediaData = media?.available ? media.data : null;
  const linkRows = talents
    .filter((x) => x.status === "proposed" || x.status === "contracted")
    .map((x) => ({ dealTalentId: x.id, talentName: x.talent.name, link: mediaData?.links.find((l) => l.dealTalentId === x.id) ?? null }));
  const active = talents.filter((x) => !["declined", "removed"].includes(x.status));
  return (
    <div className="flex flex-col gap-5">
      {inExecution && exec.available ? (
        <section className="flex flex-col gap-3" data-testid="deal-execution">
          <h2 className="text-base font-semibold text-fg">{te("title")}</h2>
          <p className="type-body-sm text-fg-muted">{te("intro")}</p>
          <DeliverablesBoard
            portal="agency"
            dealId={deal.id}
            requestId={deal.requestId}
            deliverables={exec.data?.deliverables ?? []}
            brief={exec.data?.brief}
            canAct={canEdit}
            documents={docs}
            emptyText={te("empty")}
            media={mediaData ? { readings: mediaData.metrics, comments: mediaData.comments, youtubeConfigured: youTubeConfigured(), today } : null}
          />
        </section>
      ) : null}
      {inExecution && mediaData ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="deal-links" data-testid="deal-links">
            <div className="flex flex-col gap-1">
              <h2 id="deal-links" className="text-base font-semibold text-fg">
                {tm("links.title")}
              </h2>
              <p className="type-caption text-fg-muted">{tm("links.agencyHint")}</p>
            </div>
            <TrackingPanel portal="agency" origin={origin} dealId={deal.id} requestId={deal.requestId} rows={linkRows} sales={mediaData.sales} showSales={isAdmin} canEdit={canEdit} brandSite={brandSite} today={today} />
          </section>
          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="deal-music" data-testid="deal-music">
            <div className="flex flex-col gap-1">
              <h2 id="deal-music" className="text-base font-semibold text-fg">
                {tm("music.title")}
              </h2>
              <p className="type-caption text-fg-muted">{tm("music.agencyHint")}</p>
            </div>
            <MusicPanel tracks={mediaData.music} canEdit={canEdit} dealId={deal.id} requestId={deal.requestId} today={today} />
          </section>
        </div>
      ) : null}
      <section className="flex flex-col gap-3">
        {inExecution ? <h2 className="text-base font-semibold text-fg">{t("planTitle")}</h2> : null}
        <p className="type-body-sm text-fg-muted">{t("intro")}</p>
        <DeliverablesEditor dealId={deal.id} talents={active.map((x) => ({ dealTalentId: x.id, name: x.talent.name, city: x.talent.city, state: x.talent.state, hasLogin: x.talent.hasLogin, avatarUrl: x.talent.avatarUrl }))} items={items.filter((d) => d.status !== "cancelled")} canEdit={canEdit} />
      </section>
    </div>
  );
}
