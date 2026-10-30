import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { BackLink } from "@/components/ui/back-link";
import { notFound } from "next/navigation";
import { AuctionRoom } from "@/components/collectibles/AuctionRoom";
import { Gallery } from "@/components/collectibles/Gallery";
import { AvatarInitials, DemoBadge } from "@/components/ui";
import { AvatarImage } from "@/components/ui/avatar-image";
import { trackEvent } from "@/lib/analytics/track";
import { getUser, hasRole } from "@/lib/auth/session";
import { EMPTY_MINE, fetchCollectible, fetchMyCollectibleState, finalizeIfDue } from "@/lib/collectibles/queries";
import { createClient } from "@/lib/supabase/server";

// Página do colecionável: galeria grande, herói, autenticidade e a sala do lance ao vivo.
// Quem não entrou assiste e recebe o convite para entrar e dar lance.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return {};
  const loaded = await fetchCollectible(await createClient(), id);
  return loaded ? { title: loaded.item.title } : {};
}

export default async function CollectiblePage({ params }: Props) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [t, supabase, user] = await Promise.all([getTranslations("collectibles"), createClient(), getUser()]);
  let loaded = await fetchCollectible(supabase, id);
  if (!loaded) notFound();
  // encerrado pelo relógio e ainda sem resultado: grava agora (idempotente)
  if (await finalizeIfDue(supabase, loaded.item, Boolean(user))) loaded = (await fetchCollectible(supabase, id)) ?? loaded;
  const [mine, isAdmin] = await Promise.all([
    user ? fetchMyCollectibleState(supabase, id) : Promise.resolve(EMPTY_MINE),
    user ? hasRole("admin") : Promise.resolve(false),
    trackEvent("collectible.view", { collectible_id: id }),
  ]);
  const { item } = loaded;
  const viewer = !user ? "anon" : isAdmin ? "admin" : "user";

  return (
    <div className="flex flex-col gap-5 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] md:items-start md:gap-8">
      <div className="flex flex-col gap-4">
        <BackLink href="/shop/colecionaveis">{t("detail.back")}</BackLink>
        <Gallery photos={item.photos} title={item.title} />
      </div>

      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <DemoBadge />
            {item.isDemo ? <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-warning">{t("detail.demoItem")}</span> : null}
          </div>
          <h1 className="text-2xl font-bold leading-tight text-fg">{item.title}</h1>
          {item.hero ? (
            <Link
              href={`/personalities/${item.hero.slug}`}
              className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span className="relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-elevated text-xs font-bold uppercase">
                <AvatarImage src={item.hero.avatar_url} alt="" fallback={<AvatarInitials name={item.hero.name} />} fill sizes="32px" className="object-cover" />
              </span>
              {t("detail.signedBy", { name: item.hero.name })}
            </Link>
          ) : null}
        </header>

        <AuctionRoom
          initial={{ item, bids: loaded.bids, mine }}
          serverNow={Date.now()}
          viewer={viewer}
          loginHref={`/login?next=${encodeURIComponent(`/shop/colecionaveis/${id}`)}`}
        />

        {item.description ? (
          <section aria-labelledby="collectible-about" className="flex flex-col gap-1">
            <h2 id="collectible-about" className="text-sm font-semibold text-fg">
              {t("detail.about")}
            </h2>
            <p className="whitespace-pre-line text-sm text-fg-muted">{item.description}</p>
          </section>
        ) : null}
        {item.authenticityNote ? (
          <section aria-labelledby="collectible-auth" className="flex gap-3 rounded-2xl border border-border bg-surface p-4">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
            <div className="flex flex-col gap-1">
              <h2 id="collectible-auth" className="text-sm font-semibold text-fg">
                {t("detail.authenticity")}
              </h2>
              <p className="whitespace-pre-line text-sm text-fg-muted">{item.authenticityNote}</p>
            </div>
          </section>
        ) : null}
        <details className="rounded-2xl border border-border bg-surface p-4 text-sm text-fg-muted">
          <summary className="min-h-11 cursor-pointer content-center font-semibold text-fg">{t("detail.rulesTitle")}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{t("detail.rules.increments")}</li>
            <li>{t("detail.rules.antiSnipe")}</li>
            <li>{t("detail.rules.selfOutbid")}</li>
            <li>{t("detail.rules.winner")}</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
