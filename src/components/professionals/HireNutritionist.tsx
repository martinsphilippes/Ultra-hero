import { ChevronRight, Salad } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { NutritionistSoon } from "@/components/recipes/showcase/NutritionistSoon";
import { Avatar } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { serviceIdsInCart, suggestedNutritionists } from "@/lib/professionals/queries";
import { hireAction, type TapSource } from "@/lib/professionals/rules";
import { loadHireEnv } from "@/lib/professionals/server";
import { HireButton } from "./HireButton";
import { ServiceMeta, VerifiedBadge } from "./ProfessionalBits";

type Props = {
  /** Receita aberta (página) ou null (Alimentação do herói). */
  contentId: string | null;
  /** Herói da vitrine (sugeridos dele entram depois dos da receita). */
  creatorId: string | null;
  source: Extract<TapSource, "receita" | "alimentacao">;
  /** Para onde voltar depois do login. */
  nextPath: string;
};

// "Contratar nutricionista" (Etapa 3, 0058): sugeridos da receita, depois do herói, senão qualquer
// nutricionista aprovado. Cada um com "Contratar" (1º serviço; carrinho, pagamento simulado) e "Ver
// perfil". No app das lojas só o perfil. Sem a 0058 no banco: a linha "em breve" de antes.
export async function HireNutritionist({ contentId, creatorId, source, nextPath }: Props) {
  const [data, env] = await Promise.all([suggestedNutritionists({ contentId, creatorId }), loadHireEnv()]);
  if (!data.available || data.items.length === 0) return <NutritionistSoon />;
  const [t, locale] = await Promise.all([getTranslations("professionals"), getLocale()]);
  const inCart = !env.nativeApp && env.userId ? await serviceIdsInCart() : new Set<string>();
  const heroParam = creatorId ? `&heroi=${creatorId}` : "";

  return (
    <section aria-labelledby={`hire-nutri-${source}`} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="hire-nutritionist">
      <div className="flex items-start gap-2">
        <Salad className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
        <div className="flex flex-col gap-0.5">
          <h2 id={`hire-nutri-${source}`} className="text-base font-semibold text-fg">
            {env.nativeApp ? t("specialtyPlural.nutritionist") : t("nutritionist.title")}
          </h2>
          <p className="type-body-sm text-fg-muted">{t("nutritionist.description")}</p>
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {data.items.map((pro) => {
          const service = pro.services[0] ?? null;
          const action = hireAction({ nativeApp: env.nativeApp, commerceEnabled: env.commerceEnabled, loggedIn: env.userId !== null, ownService: env.userId !== null && env.userId === pro.userId });
          const tap = { professionalId: pro.id, creatorId, source };
          return (
            <li key={pro.id} className="flex flex-col gap-3 rounded-xl border border-border bg-bg p-3" data-testid="hire-nutritionist-item">
              <div className="flex items-center gap-3">
                <Avatar src={pro.photoUrl} name={pro.name} size="md" alt="" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-fg">{pro.name}</span>
                    {pro.registryVerified ? <VerifiedBadge /> : null}
                  </span>
                  {service ? (
                    <span className="flex flex-wrap items-center gap-x-2 type-caption text-fg-muted">
                      <span className="font-medium text-fg">{service.title}</span>
                      <ServiceMeta service={service} />
                      <span className="type-numeric font-semibold text-fg">{formatCurrency(service.priceCents / 100, locale as Locale)}</span>
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {service ? (
                  <HireButton serviceId={service.id} title={service.title} action={action} inCart={inCart.has(service.id)} nextPath={nextPath} tap={tap} size="sm" />
                ) : null}
                <Link
                  href={`/profissionais/${pro.slug}?origem=${source}${heroParam}`}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  data-testid="hire-nutritionist-profile"
                >
                  {t("list.viewProfile")}
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      <Link href="/profissionais?especialidade=nutritionist" className="self-start text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        {t("nutritionist.seeAll")}
      </Link>
    </section>
  );
}
