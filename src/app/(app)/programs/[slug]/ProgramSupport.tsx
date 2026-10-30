import { ChevronRight, Handshake, Play, ShoppingBag } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { QuickAddToCart } from "@/components/commerce/QuickAddToCart";
import { HireButton } from "@/components/professionals/HireButton";
import { ServiceMeta, VerifiedBadge } from "@/components/professionals/ProfessionalBits";
import { Avatar } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import type { ProgramProfessional } from "@/lib/professionals/queries";
import { hireAction } from "@/lib/professionals/rules";
import { pickProgramService } from "@/lib/programs/support";
import type { ProgramProduct } from "@/lib/programs/support-query";

// Etapa 4 (0059): produto(s) e profissional(is) ligados ao programa. Linhas compactas usadas em
// "Próximos passos" e nas telas do card Apoio. Compra e contratação seguem as mesmas travas do resto
// (comércio desligado ou app das lojas: sem produto; no app, profissional só com "Ver perfil").

export type HireEnv = { nativeApp: boolean; commerceEnabled: boolean; userId: string | null; inCart: Set<string> };

export async function ProgramProductRows({ products, isLoggedIn, nextPath }: { products: ProgramProduct[]; isLoggedIn: boolean; nextPath: string }) {
  const [t, locale] = await Promise.all([getTranslations("consume.program.actions"), getLocale()]);
  return (
    <ul className="flex flex-col gap-3" data-testid="program-support-products">
      {products.map(({ product, note, maxQuantity, inCart }) => (
        <li key={product.id} className="flex flex-col gap-3 rounded-xl border border-border bg-bg p-3" data-testid="program-support-product">
          <Link href={`/shop/${product.slug}`} className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-surface-elevated">
              <Image src={product.image_url} alt="" fill unoptimized sizes="56px" className="object-cover" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="line-clamp-2 text-sm font-semibold text-fg">{product.title}</span>
              {product.seller ? <span className="type-caption text-fg-muted">{product.seller.name}</span> : null}
              <span className="type-numeric text-sm font-semibold text-fg">{formatCurrency(product.price_cents_demo / 100, locale as Locale)}</span>
            </span>
          </Link>
          {note ? (
            <p className="type-caption text-fg-muted">
              <span className="font-semibold text-fg">{t("why")}:</span> {note}
            </p>
          ) : null}
          <QuickAddToCart
            productId={product.id}
            productTitle={product.title}
            priceCents={product.price_cents_demo}
            maxQuantity={maxQuantity}
            purchasable
            isLoggedIn={isLoggedIn}
            inCart={inCart}
            nextPath={nextPath}
          />
        </li>
      ))}
    </ul>
  );
}

export async function ProgramProfessionalRows({ professionals, env, creatorId, nextPath }: { professionals: ProgramProfessional[]; env: HireEnv; creatorId: string | null; nextPath: string }) {
  const [t, locale] = await Promise.all([getTranslations("professionals"), getLocale()]);
  const heroParam = creatorId ? `&heroi=${creatorId}` : "";
  return (
    <ul className="flex flex-col gap-3" data-testid="program-support-professionals">
      {professionals.map((pro) => {
        const service = pickProgramService(pro.services, pro.preferredServiceId);
        const action = hireAction({ nativeApp: env.nativeApp, commerceEnabled: env.commerceEnabled, loggedIn: env.userId !== null, ownService: env.userId !== null && env.userId === pro.userId });
        return (
          <li key={pro.id} className="flex flex-col gap-3 rounded-xl border border-border bg-bg p-3" data-testid="program-support-professional">
            <div className="flex items-center gap-3">
              <Avatar src={pro.photoUrl} name={pro.name} size="md" alt="" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-fg">{pro.name}</span>
                  {pro.registryVerified ? <VerifiedBadge /> : null}
                </span>
                <span className="type-caption text-fg-muted">{t(`specialty.${pro.specialty}`)}</span>
                {service ? (
                  <span className="flex flex-wrap items-center gap-x-2 type-caption text-fg-muted" data-testid="program-support-service">
                    <span className="font-medium text-fg">{service.title}</span>
                    <ServiceMeta service={service} />
                    <span className="type-numeric font-semibold text-fg">{formatCurrency(service.priceCents / 100, locale as Locale)}</span>
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {service ? (
                <HireButton
                  serviceId={service.id}
                  title={service.title}
                  action={action}
                  inCart={env.inCart.has(service.id)}
                  nextPath={nextPath}
                  tap={{ professionalId: pro.id, creatorId, source: "programa" }}
                  size="sm"
                />
              ) : null}
              <Link
                href={`/profissionais/${pro.slug}?origem=programa${heroParam}`}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                data-testid="program-support-profile"
              >
                {t("list.viewProfile")}
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

type Step = { key: "start" | "buy" | "hire"; icon: ReactNode; title: string; hint: string; body: ReactNode };

/** "Próximos passos": Começar, Comprar produto e Contratar profissional (só os disponíveis). */
export async function ProgramActions({
  start,
  startHint,
  products,
  professionals,
  nativeApp,
}: {
  start: ReactNode;
  startHint: string;
  products: ReactNode | null;
  professionals: ReactNode | null;
  nativeApp: boolean;
}) {
  const t = await getTranslations("consume.program.actions");
  const steps: Step[] = [{ key: "start", icon: <Play />, title: t("start"), hint: startHint, body: start }];
  if (products) steps.push({ key: "buy", icon: <ShoppingBag />, title: t("buy"), hint: t("buyHint"), body: products });
  // no app das lojas não há contratação: o passo vira "Profissionais indicados" (só o perfil)
  if (professionals) steps.push({ key: "hire", icon: <Handshake />, title: nativeApp ? t("professionals") : t("hire"), hint: t("hireHint"), body: professionals });
  return (
    <section aria-labelledby="program-actions-title" className="flex flex-col gap-4" data-testid="program-actions">
      <div className="flex flex-col gap-0.5">
        <h2 id="program-actions-title" className="type-h2 text-fg">
          {t("title")}
        </h2>
        <p className="type-body-sm text-fg-muted">{t("description")}</p>
      </div>
      <ol className="grid gap-3 lg:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.key} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid={`program-action-${step.key}`}>
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text [&_svg]:size-[1.125rem]">
                {step.icon}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <h3 className="text-base font-semibold text-fg">
                  <span className="sr-only">{i + 1}. </span>
                  {step.title}
                </h3>
                <p className="type-caption text-fg-muted">{step.hint}</p>
              </div>
            </div>
            {step.body}
          </li>
        ))}
      </ol>
    </section>
  );
}
