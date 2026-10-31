import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FilterAnchor } from "@/components/admin-ops/FilterAnchor";
import { MessageThread } from "@/components/deals/MessageThread";
import { listDealTalents, listMessages } from "@/lib/deals/queries";
import { loadDeal } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("dealMessages") };
}

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ canal?: string }> };

// Conversa do negócio: canal com a marca e um canal por creator consultado (nunca os três juntos).
export default async function DealMessagesPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const { deal, canEdit } = await loadDeal(id);
  const [t, talents] = await Promise.all([getTranslations("agency.deal.messages"), listDealTalents(deal.id)]);
  const consulted = talents.filter((x) => x.consultedAt && x.status !== "removed");
  const selected = consulted.find((x) => x.talentId === sp.canal) ?? null;
  const channel = selected ? "talent_agency" : "brand_agency";
  const messages = await listMessages(deal.id, channel, selected?.talentId);
  const base = `/agencia/negocios/${deal.id}/conversa`;
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label={t("channels")} className="flex flex-wrap gap-2">
        <FilterAnchor href={base} active={!selected} label={t("brandChannel", { brand: deal.brand.name })} />
        {consulted.map((x) => (
          <FilterAnchor key={x.id} href={`${base}?canal=${x.talentId}`} active={selected?.id === x.id} label={x.talent.name} />
        ))}
      </nav>
      {selected && !selected.talent.hasLogin ? <p className="rounded-xl border border-dashed border-border px-3 py-2 type-body-sm text-fg-muted">{t("noLoginHint")}</p> : null}
      {!selected && !deal.brandVisible ? <p className="rounded-xl border border-dashed border-border px-3 py-2 type-body-sm text-fg-muted">{t("brandNotVisibleHint")}</p> : null}
      <MessageThread portal="agency" dealId={deal.id} channel={channel} talentId={selected?.talentId ?? null} messages={messages} mySide="agency" canPost={canEdit && (Boolean(selected) || deal.brandVisible)} revalidate={base} />
    </div>
  );
}
