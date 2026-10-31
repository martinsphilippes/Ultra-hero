import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  ShortlistPanel,
  type Candidate,
} from "@/components/deals/ShortlistPanel";
import { getRequest, listDealFees, listDealTalents } from "@/lib/deals/queries";
import type { Reason } from "@/lib/deals/vocab";
import { listTalents } from "@/lib/talent/queries";
import { createClient } from "@/lib/supabase/server";
import { loadDeal } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("dealTalents") };
}

type Props = { params: Promise<{ id: string }> };

/** Critérios atendidos por um talento do casting em relação ao briefing (só os que o pedido informa). */
function reasonsFor(
  talent: { segmentIds: string[]; state: string | null; availability: string },
  networks: Set<string>,
  req: {
    segmentIds: string[];
    states: string[];
    networks: string[];
    hasPeriod: boolean;
  },
  segmentNames: Map<string, string>,
): Reason[] {
  const out: Reason[] = [];
  if (req.segmentIds.length > 0) {
    const hit = talent.segmentIds.filter((s) => req.segmentIds.includes(s));
    out.push({
      code: "segment",
      met: hit.length > 0,
      detail: hit
        .map((s) => segmentNames.get(s) ?? "")
        .filter(Boolean)
        .slice(0, 3),
    });
  }
  if (req.states.length > 0)
    out.push({
      code: "region",
      met: Boolean(talent.state && req.states.includes(talent.state)),
      detail: talent.state ? [talent.state] : [],
    });
  if (req.networks.length > 0) {
    const hit = req.networks.filter((n) => networks.has(n));
    out.push({ code: "network", met: hit.length > 0, detail: hit.slice(0, 3) });
  }
  if (req.hasPeriod)
    out.push({
      code: "availability",
      met: talent.availability !== "unavailable",
      detail: [],
    });
  return out;
}

// Creators do negócio: elenco sugerido com critérios, consulta de interesse, respostas, cachê (Adm).
export default async function DealTalentsPage({ params }: Props) {
  const { id } = await params;
  const { ctx, deal, canEdit, isAdmin } = await loadDeal(id);
  const [rows, fees, request, casting] = await Promise.all([
    listDealTalents(deal.id),
    isAdmin ? listDealFees(deal.id) : Promise.resolve({}),
    deal.requestId ? getRequest(deal.requestId) : Promise.resolve(null),
    canEdit
      ? listTalents(ctx.agency.id)
      : Promise.resolve({ available: true, items: [] }),
  ]);
  const supabase = await createClient();
  const [{ data: segmentRows }, { data: networkRows }, { data: docs }] =
    await Promise.all([
      supabase
        .from("talent_segments")
        .select("id, name")
        .eq("agency_id", ctx.agency.id),
      canEdit
        ? supabase
            .from("talent_social_accounts")
            .select("talent_id, network")
            .eq("agency_id", ctx.agency.id)
        : Promise.resolve({
            data: [] as { talent_id: string; network: string }[],
          }),
      canEdit
        ? supabase
            .from("documents")
            .select("id, title")
            .eq("deal_id", deal.id)
            .eq("status", "ready")
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ]);
  const segmentNames = new Map((segmentRows ?? []).map((s) => [s.id, s.name]));
  const networksByTalent = new Map<string, Set<string>>();
  for (const n of networkRows ?? []) {
    if (!networksByTalent.has(n.talent_id))
      networksByTalent.set(n.talent_id, new Set());
    networksByTalent.get(n.talent_id)?.add(n.network);
  }
  const req = {
    segmentIds: deal.segmentIds,
    states: request?.targetStates ?? [],
    networks: request?.networks ?? [],
    hasPeriod: Boolean(deal.expectedStart),
  };
  const candidates: Candidate[] = casting.items.map((tl) => ({
    id: tl.id,
    name: tl.name,
    avatarUrl: tl.hero?.avatarUrl ?? null,
    city: tl.city,
    state: tl.state,
    availability: tl.availability,
    hasLogin: tl.hasLogin,
    reasons: reasonsFor(
      tl,
      networksByTalent.get(tl.id) ?? new Set(),
      req,
      segmentNames,
    ),
  }));

  return (
    <ShortlistPanel
      dealId={deal.id}
      stage={deal.stage}
      rows={rows}
      candidates={candidates}
      fees={fees}
      canEdit={canEdit}
      isAdmin={isAdmin}
      documents={docs ?? []}
    />
  );
}
