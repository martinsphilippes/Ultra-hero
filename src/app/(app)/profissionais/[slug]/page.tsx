import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { HireButton } from "@/components/professionals/HireButton";
import { RegistryLine, ServiceRow, VerifiedBadge, WhereLine } from "@/components/professionals/ProfessionalBits";
import { TapOnView } from "@/components/professionals/TapOnView";
import { Avatar } from "@/components/ui";
import { BackLink } from "@/components/ui/back-link";
import { getPublicProfessional, serviceIdsInCart } from "@/lib/professionals/queries";
import { isProfessionalSlug, isUuid, TAP_SOURCES, type TapSource } from "@/lib/professionals/rules";
import { hireActionFor, loadHireEnv } from "@/lib/professionals/server";

// Página pública do profissional (0058): perfil, selo de registro conferido e serviços com
// "Contratar" (carrinho, pagamento simulado). No app das lojas: perfil sem "Contratar".
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = isProfessionalSlug(slug) ? await getPublicProfessional(slug) : null;
  const t = await getTranslations("professionals");
  if (!data) return { title: t("meta.list") };
  return { title: `${data.professional.name} · ${t(`specialty.${data.professional.specialty}`)}`, description: data.professional.bio.slice(0, 160) || undefined };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ProfessionalPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  if (!isProfessionalSlug(slug)) notFound();
  const data = await getPublicProfessional(slug);
  if (!data) notFound();
  const { professional: pro, services } = data;
  const [t, action, env] = await Promise.all([getTranslations("professionals"), hireActionFor(pro.userId), loadHireEnv()]);
  const inCart = action === "hire" ? await serviceIdsInCart() : new Set<string>();
  // origem do toque: de onde a pessoa veio (?origem=receita&heroi=<id>); padrão = o próprio perfil
  const origin = one(query.origem);
  const source: TapSource = (TAP_SOURCES as readonly string[]).includes(origin ?? "") ? (origin as TapSource) : "perfil";
  const hero = one(query.heroi);
  const tap = { professionalId: pro.id, creatorId: hero && isUuid(hero) ? hero : null, source };
  const path = `/profissionais/${pro.slug}`;

  return (
    <div className="flex flex-col gap-6" data-testid="professional-page">
      {source === "perfil" ? null : <TapOnView tap={{ ...tap, action: "ver_perfil" }} />}
      <BackLink href="/profissionais">{t("profile.back")}</BackLink>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar src={pro.photoUrl} name={pro.name} size="xl" alt="" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="type-h1 text-balance text-fg">{pro.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-fg-muted">{t(`specialty.${pro.specialty}`)}</span>
            {pro.registryVerified ? <VerifiedBadge /> : null}
          </div>
          <RegistryLine pro={pro} />
          <WhereLine pro={pro} />
        </div>
      </header>

      {pro.bio ? (
        <section aria-labelledby="pro-about" className="flex flex-col gap-2">
          <h2 id="pro-about" className="type-h3 text-fg">
            {t("profile.about")}
          </h2>
          <p className="type-body max-w-prose whitespace-pre-line text-fg-muted">{pro.bio}</p>
        </section>
      ) : null}

      <section aria-labelledby="pro-services" className="flex flex-col gap-3">
        <h2 id="pro-services" className="type-h3 text-fg">
          {t("profile.services")}
        </h2>
        {services.length === 0 ? (
          <p className="type-body-sm text-fg-muted">{t("profile.noServices")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {services.map((service) => (
              <li key={service.id}>
                <ServiceRow
                  service={service}
                  action={
                    env.nativeApp ? null : (
                      <HireButton serviceId={service.id} title={service.title} action={action} inCart={inCart.has(service.id)} nextPath={path} tap={tap} />
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
