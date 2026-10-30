import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { photoUnoptimized } from "@/components/collectibles/CollectibleCard";
import { PayForm } from "@/components/collectibles/PayForm";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { BackLink } from "@/components/ui/back-link";
import { DemoBadge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { requireUser } from "@/lib/auth/session";
import { coverPhoto, fetchCollectible, fetchMyCollectibleState, finalizeIfDue } from "@/lib/collectibles/queries";
import { createClient } from "@/lib/supabase/server";

// Pagamento SIMULADO do arremate: só o vencedor chega aqui; vira um pedido de teste comum
// (aparece em Minhas compras). Nenhuma cobrança real.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("collectibles.pay");
  return { title: t("title") };
}

export default async function CollectiblePayPage({ params }: Props) {
  const { id } = await params;
  await requireUser(`/shop/colecionaveis/${id}/pagamento`);
  const [t, locale, supabase] = await Promise.all([getTranslations("collectibles.pay"), getLocale(), createClient()]);
  let loaded = await fetchCollectible(supabase, id);
  if (!loaded) notFound();
  if (await finalizeIfDue(supabase, loaded.item, true)) loaded = (await fetchCollectible(supabase, id)) ?? loaded;
  const mine = await fetchMyCollectibleState(supabase, id);
  if (!mine.won) redirect(`/shop/colecionaveis/${id}`);
  if (mine.claimStatus === "paid" && mine.orderId) redirect(`/orders/${mine.orderId}`);

  const { data: destinations } = await supabase.from("demo_destinations").select("id, name, zone").eq("is_active", true).order("sort_order");
  const item = loaded.item;
  const photo = coverPhoto(item);

  return (
    <div className="mx-auto flex w-full max-w-prose flex-col gap-5">
      <BackLink href={`/shop/colecionaveis/${id}`}>{t("back")}</BackLink>
      <PageHeader title={t("title")} description={t("description")} eyebrow={<DemoBadge />} />
      <DemoNotice>{t("banner")}</DemoNotice>
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
        <span className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface-elevated">
          <Image src={photo} alt="" fill unoptimized={photoUnoptimized(photo)} sizes="80px" className="object-cover" />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="line-clamp-2 font-semibold text-fg">{item.title}</span>
          <span className="text-xs text-fg-muted">{t("wonFor")}</span>
          <span className="type-numeric text-lg font-bold text-fg">{formatCurrency(item.currentCents / 100, locale as Locale)}</span>
        </span>
      </div>
      <PayForm
        collectibleId={id}
        destinations={(destinations ?? []).map((d) => ({ id: d.id, name: d.name, zone: d.zone }))}
        totalLabel={formatCurrency(item.currentCents / 100, locale as Locale)}
      />
    </div>
  );
}
