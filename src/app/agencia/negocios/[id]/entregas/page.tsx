import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DeliverablesEditor } from "@/components/deals/DeliverablesEditor";
import { DeliverablesBoard } from "@/components/execution/DeliverablesBoard";
import { listDealTalents, listDeliverables } from "@/lib/deals/queries";
import { getDealExecution } from "@/lib/execution/queries";
import { createClient } from "@/lib/supabase/server";
import { loadDeal } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("dealDeliverables") };
}

type Props = { params: Promise<{ id: string }> };

// Entregáveis: antes da contratação, o planejamento por creator; em produção, a execução com versões
// (envio, aprovação da marca, publicação, comprovação e conclusão). A agência pode agir pelo creator sem login.
export default async function DealDeliverablesPage({ params }: Props) {
  const { id } = await params;
  const { deal, canEdit } = await loadDeal(id);
  const inExecution = deal.stage === "production" || deal.stage === "closed";
  const [t, te, talents, items, exec, docs] = await Promise.all([
    getTranslations("agency.deal.deliverables"),
    getTranslations("agency.execution"),
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
  ]);
  const active = talents.filter((x) => !["declined", "removed"].includes(x.status));
  return (
    <div className="flex flex-col gap-5">
      {inExecution && exec.available ? (
        <section className="flex flex-col gap-3" data-testid="deal-execution">
          <h2 className="text-base font-semibold text-fg">{te("title")}</h2>
          <p className="type-body-sm text-fg-muted">{te("intro")}</p>
          <DeliverablesBoard portal="agency" dealId={deal.id} requestId={deal.requestId} deliverables={exec.data?.deliverables ?? []} canAct={canEdit} documents={docs} emptyText={te("empty")} />
        </section>
      ) : null}
      <section className="flex flex-col gap-3">
        {inExecution ? <h2 className="text-base font-semibold text-fg">{t("planTitle")}</h2> : null}
        <p className="type-body-sm text-fg-muted">{t("intro")}</p>
        <DeliverablesEditor dealId={deal.id} talents={active.map((x) => ({ dealTalentId: x.id, name: x.talent.name }))} items={items.filter((d) => d.status !== "cancelled")} canEdit={canEdit} />
      </section>
    </div>
  );
}
