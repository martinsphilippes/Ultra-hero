import type { Metadata } from "next";
import { Gem } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CollectibleCard } from "@/components/collectibles/CollectibleCard";
import { LiveBadge } from "@/components/collectibles/LiveBadge";
import { ShopSegment } from "@/components/collectibles/ShopSegment";
import { ShopComingSoonGate } from "@/components/commerce/coming-soon/ShopComingSoonGate";
import { getNativeApp } from "@/lib/native-app/server";
import { EmptyState, PageHeader } from "@/components/ui";
import { fetchCollectiblesList, type CollectibleView } from "@/lib/collectibles/queries";
import { getShopComingSoonState } from "@/lib/shop/coming-soon-server";
import { createClient } from "@/lib/supabase/server";

// Colecionáveis (aba Comprar): itens assinados com lance ao vivo. Ao vivo no topo (acaba antes
// primeiro), depois "Em breve" e os encerrados dos últimos 30 dias. Sem a 0057: aviso de "em breve".
// Coming soon (src/lib/shop/coming-soon.ts): é a aba padrão de Comprar; a vitrine fica atrás do aviso
// (sem lance) e a descrição provoca a chegada dos itens. Admin vê tudo normal.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("collectibles.list");
  return { title: t("title"), description: t("description") };
}

export default async function CollectiblesPage() {
  const [t, tcs, supabase, nativeApp, comingSoon] = await Promise.all([
    getTranslations("collectibles"),
    getTranslations("commerce.comingSoon"),
    createClient(),
    getNativeApp(),
    getShopComingSoonState(),
  ]);
  const serverNow = Date.now();
  const list = await fetchCollectiblesList(supabase, serverNow);
  const empty = list.live.length + list.upcoming.length + list.ended.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("list.title")} description={comingSoon.locked ? tcs("collectiblesDescription") : t("list.description")} />
      {/* no app das lojas a Loja não existe: sem o seletor */}
      {nativeApp ? null : <ShopSegment current="collectibles" />}

      <ShopComingSoonGate section="collectibles" nextPath="/shop/colecionaveis">
        {empty ? (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState icon={<Gem />} title={list.available ? t("list.empty") : t("list.unavailable")} description={t("list.emptyDescription")} />
          </div>
        ) : (
          <>
            <Shelf id="ao-vivo" title={t("list.live")} badge={list.live.length > 0 ? <LiveBadge label={t("segment.live")} size="md" /> : null} items={list.live} serverNow={serverNow} priority />
            <Shelf id="em-breve" title={t("list.upcoming")} items={list.upcoming} serverNow={serverNow} />
            <Shelf id="encerrados" title={t("list.ended")} items={list.ended} serverNow={serverNow} />
          </>
        )}
      </ShopComingSoonGate>
    </div>
  );
}

function Shelf({ id, title, badge, items, serverNow, priority }: { id: string; title: string; badge?: ReactNode; items: CollectibleView[]; serverNow: number; priority?: boolean }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={`shelf-${id}`} className="flex flex-col gap-3">
      <h2 id={`shelf-${id}`} className="flex items-center gap-2 text-base font-semibold text-fg">
        {title}
        {badge}
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid={`collectibles-${id}`}>
        {items.map((item, index) => (
          <CollectibleCard key={item.id} item={item} serverNow={serverNow} priority={priority && index < 2} />
        ))}
      </ul>
    </section>
  );
}
