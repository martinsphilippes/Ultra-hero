import "server-only";
import { getTranslations } from "next-intl/server";
import type { ServiceCartItem } from "@/components/professionals/ServiceCartSection";
import { loadServiceCart } from "./queries";
import { serviceFormatParts } from "./rules";

export type ServiceCartView = {
  available: boolean;
  items: ServiceCartItem[];
  subtotalCents: number;
  /** Algum serviço saiu do ar: o checkout espera a remoção. */
  blocking: boolean;
  /** Preço que a pessoa está vendo (o checkout_with_services confere). */
  expected: { service_id: string; price_cents: number }[];
};

// Serviços do carrinho já prontos para a tela (linha de formato traduzida).
export async function loadServiceCartView(): Promise<ServiceCartView> {
  const [cart, t] = await Promise.all([loadServiceCart(), getTranslations("professionals")]);
  const items: ServiceCartItem[] = cart.lines.map((line) => {
    const s = line.service;
    if (!s) return { serviceId: line.serviceId, title: null, professional: null, meta: null, priceCents: null };
    const parts = serviceFormatParts(s);
    const meta = [t(`mode.${parts.mode}`), parts.minutes !== null ? t("format.minutes", { minutes: parts.minutes }) : null, parts.weeks !== null ? t("format.weeks", { weeks: parts.weeks }) : null]
      .filter(Boolean)
      .join(" · ");
    return { serviceId: line.serviceId, title: s.title, professional: s.professional ? { slug: s.professional.slug, name: s.professional.name } : null, meta, priceCents: s.priceCents };
  });
  const live = cart.lines.filter((l) => l.service);
  return {
    available: cart.available,
    items,
    subtotalCents: live.reduce((sum, l) => sum + (l.service?.priceCents ?? 0), 0),
    blocking: cart.lines.some((l) => !l.service),
    expected: live.map((l) => ({ service_id: l.serviceId, price_cents: l.service!.priceCents })),
  };
}
