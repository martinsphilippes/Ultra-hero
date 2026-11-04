import { Hourglass as HourglassIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { SHOP_TIMEZONE, shopHomeHref } from "@/lib/shop/coming-soon";
import { getShopComingSoonState, hasShopLaunchOptIn } from "@/lib/shop/coming-soon-server";
import { ComingSoonCountdown } from "./ComingSoonCountdown";
import { Hourglass } from "./Hourglass";
import { NotifyLaunchButton } from "./NotifyLaunchButton";
import "./coming-soon.css";

export type ComingSoonSection = "shop" | "collectibles" | "product" | "collectible" | "cart" | "checkout";

type Props = {
  section: ComingSoonSection;
  nextPath: string;
  /** false = sem o aviso nesta tela (ex.: carrinho só com serviços de profissionais, que não são a loja). */
  enabled?: boolean;
  children: ReactNode;
};

const DETAIL_SECTIONS: readonly ComingSoonSection[] = ["product", "collectible", "cart", "checkout"];

// Coming soon da aba Comprar. Com a loja trancada para quem vê (modo ativo e não admin), o conteúdo real
// continua na página, mas cinza, desfocado, apagado, `inert` e fora da árvore de acessibilidade (nada se
// clica: nem produto, nem carrinho, nem lance); por cima, o cartão com ampulheta, contagem e "Me avise".
// As server actions de compra/lance também barram (shop_coming_soon), então URL direta não compra nada.
// Admin vê a loja normal com um aviso fino no topo. Fora do modo: só os filhos.
export async function ShopComingSoonGate({ section, nextPath, enabled = true, children }: Props) {
  const state = await getShopComingSoonState();
  if (!enabled) return <>{children}</>;
  if (!state.locked) {
    return (
      <>
        {state.comingSoon && state.isAdmin ? <AdminNotice opensAt={state.opensAt} /> : null}
        {children}
      </>
    );
  }

  const [t, optedIn] = await Promise.all([getTranslations("commerce.comingSoon"), hasShopLaunchOptIn()]);
  const isCollectibles = section === "collectibles" || section === "collectible";

  return (
    <div className="uh-cs" data-testid="shop-coming-soon" data-section={section}>
      <div className="uh-cs-behind" inert aria-hidden="true">
        {children}
      </div>
      <div className="uh-cs-layer">
        <section aria-labelledby="shop-coming-soon-title" className="uh-cs-card flex flex-col items-center gap-3.5 px-5 pb-5 pt-5 sm:gap-5 sm:px-7 sm:pb-6 sm:pt-6">
          <p className="uh-cs-mono text-[0.6875rem] uppercase tracking-[0.22em] text-[var(--cs-orange-soft)]">{isCollectibles ? t("eyebrowCollectibles") : t("eyebrowShop")}</p>
          <Hourglass className="h-[4.5rem] w-12 sm:h-28 sm:w-[4.7rem]" />
          <h2 id="shop-coming-soon-title" className="uh-cs-title">
            {t("title")}
            <span aria-hidden="true" className="uh-cs-title-dot">
              .
            </span>
          </h2>
          <ComingSoonCountdown opensAt={state.opensAt} serverNow={state.serverNow} />
          <div className="flex flex-col gap-2">
            <p className="text-pretty text-[0.9375rem] leading-relaxed text-[var(--cs-sand)]">{t("body")}</p>
            {/* na lista a provocação já está na descrição do cabeçalho; no detalhe ela vem aqui */}
            {section === "collectible" ? <p className="text-pretty text-sm leading-relaxed text-[var(--cs-sand-muted)]">{t("collectiblesTease")}</p> : null}
          </div>
          <NotifyLaunchButton signedIn={state.signedIn} initialOptedIn={optedIn} nextPath={nextPath} />
          {/* nas telas de detalhe o "voltar" original fica desfocado e inerte: este leva à aba Comprar */}
          {DETAIL_SECTIONS.includes(section) ? (
            <Link href={shopHomeHref(true)} className="uh-cs-ghost">
              {t("backToShop")}
            </Link>
          ) : null}
        </section>
      </div>
    </div>
  );
}

async function AdminNotice({ opensAt }: { opensAt: string }) {
  const [t, locale] = await Promise.all([getTranslations("commerce.comingSoon"), getLocale()]);
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: SHOP_TIMEZONE,
  }).format(new Date(opensAt));
  return (
    <p role="note" data-testid="shop-coming-soon-admin" className="mb-4 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-fg">
      <HourglassIcon className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
      <span>{t("adminNotice", { date })}</span>
    </p>
  );
}
