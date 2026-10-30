"use client";

import { Handshake, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeServiceFromCart } from "@/app/(app)/profissionais/actions";
import { IconButton } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";

export type ServiceCartItem = {
  serviceId: string;
  /** null = saiu do ar. */
  title: string | null;
  professional: { slug: string; name: string } | null;
  meta: string | null;
  priceCents: number | null;
};

// Serviços no carrinho (0058): um de cada, sem quantidade nem frete; o que saiu do ar pede remoção.
export function ServiceCartSection({ items, subtotalCents }: { items: ServiceCartItem[]; subtotalCents: number }) {
  const t = useTranslations("professionals.cart");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function remove(serviceId: string) {
    setBusy(serviceId);
    startTransition(async () => {
      await removeServiceFromCart({ serviceId });
      setBusy(null);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="cart-services" className="rounded-2xl border border-border bg-surface px-4" data-testid="cart-services">
      <header className="flex items-center justify-between gap-3 border-b border-border py-3">
        <h2 id="cart-services" className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Handshake className="size-4 text-accent-text" aria-hidden="true" />
          {t("title")}
        </h2>
        <p className="type-caption text-fg-muted">{t("itemsCount", { n: items.length })}</p>
      </header>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.serviceId} className="flex items-start gap-3 py-3" data-testid="cart-service-line">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {item.title ? (
                <>
                  <p className="text-sm font-medium text-fg">{item.title}</p>
                  {item.professional ? (
                    <Link href={`/profissionais/${item.professional.slug}`} className="type-caption font-semibold text-accent-text hover:underline">
                      {item.professional.name}
                    </Link>
                  ) : null}
                  {item.meta ? <p className="type-caption text-fg-muted">{item.meta}</p> : null}
                </>
              ) : (
                <p role="alert" className="type-body-sm font-medium text-warning">
                  {t("unavailable")}
                </p>
              )}
            </div>
            {item.priceCents !== null ? <p className="type-numeric text-sm font-semibold text-fg">{formatCurrency(item.priceCents / 100, locale)}</p> : null}
            <IconButton
              label={t("removeLabel", { title: item.title ?? "" })}
              icon={<Trash2 />}
              variant="ghost"
              size="md"
              onClick={() => remove(item.serviceId)}
              loading={pending && busy === item.serviceId}
              data-testid="cart-service-remove"
            />
          </li>
        ))}
      </ul>
      <footer className="flex flex-col gap-2 border-t border-border py-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-fg-muted">{t("subtotal")}</span>
          <span className="type-numeric font-semibold text-fg">{formatCurrency(subtotalCents / 100, locale)}</span>
        </div>
        <p className="type-caption text-fg-muted">{t("note")}</p>
      </footer>
    </section>
  );
}
