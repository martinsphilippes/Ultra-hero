import { BadgeCheck, Globe, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import type { ProfessionalCardView, ServiceView } from "@/lib/professionals/queries";
import { serviceFormatParts, type ServiceShape } from "@/lib/professionals/rules";
import { cn } from "@/lib/utils";

// Peças de apresentação dos profissionais (0058), sem estado: servem às páginas públicas, ao portal
// e ao admin.

/** Selo "Registro conferido". */
export function VerifiedBadge({ className }: { className?: string }) {
  const t = useTranslations("professionals");
  return (
    <Badge variant="success" size="sm" className={className} title={t("verifiedHint")} data-testid="pro-verified">
      <BadgeCheck aria-hidden="true" />
      {t("verified")}
    </Badge>
  );
}

/** "CRN 3-00001/SP". */
export function RegistryLine({ pro, className }: { pro: Pick<ProfessionalCardView, "registryType" | "registryNumber" | "registryUf">; className?: string }) {
  const t = useTranslations("professionals");
  return <span className={cn("type-caption text-fg-muted", className)}>{t("registry", { type: pro.registryType, number: pro.registryNumber, uf: pro.registryUf })}</span>;
}

/** "Online · 60 min" / "Presencial · Plano de 4 sem.". */
export function ServiceMeta({ service, className }: { service: ServiceShape; className?: string }) {
  const t = useTranslations("professionals");
  const parts = serviceFormatParts(service);
  const bits = [t(`mode.${parts.mode}`), parts.minutes !== null ? t("format.minutes", { minutes: parts.minutes }) : null, parts.weeks !== null ? t("format.weeks", { weeks: parts.weeks }) : null].filter(Boolean);
  return <span className={cn("type-caption text-fg-muted", className)}>{bits.join(" · ")}</span>;
}

/** Onde atende: online e/ou cidades. */
export function WhereLine({ pro }: { pro: Pick<ProfessionalCardView, "online" | "cities"> }) {
  const t = useTranslations("professionals");
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-fg-muted">
      {pro.online ? (
        <span className="inline-flex items-center gap-1">
          <Globe className="size-3.5" aria-hidden="true" />
          {t("online")}
        </span>
      ) : null}
      {pro.cities.length > 0 ? (
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden="true" />
          {t("cities", { cities: pro.cities.join(", ") })}
        </span>
      ) : null}
    </span>
  );
}

/** Card da lista: foto, nome, especialidade, selo, registro, onde atende e "a partir de". */
export function ProfessionalCard({ pro, href }: { pro: ProfessionalCardView; href: string }) {
  const t = useTranslations("professionals");
  const locale = useLocale() as Locale;
  return (
    <Link
      href={href}
      className="flex h-full gap-3 rounded-2xl border border-border bg-surface p-4 transition-[border-color,box-shadow] hover:border-accent/50 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      data-testid="pro-card"
    >
      <Avatar src={pro.photoUrl} name={pro.name} size="lg" alt="" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-semibold text-fg">{pro.name}</span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-fg-muted">{t(`specialty.${pro.specialty}`)}</span>
          {pro.registryVerified ? <VerifiedBadge /> : null}
        </span>
        <RegistryLine pro={pro} />
        <WhereLine pro={pro} />
        {pro.fromCents !== null ? <span className="type-numeric text-sm font-semibold text-fg">{t("from", { price: formatCurrency(pro.fromCents / 100, locale) })}</span> : null}
      </span>
    </Link>
  );
}

/** Linha de serviço: título, formato, descrição e preço; a ação (Contratar) vem por `action`. */
export function ServiceRow({ service, action, className }: { service: ServiceView; action?: ReactNode; className?: string }) {
  const locale = useLocale() as Locale;
  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-start sm:justify-between", className)} data-testid="pro-service">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold text-fg">{service.title}</p>
        <ServiceMeta service={service} />
        {service.description ? <p className="type-body-sm text-fg-muted">{service.description}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
        <p className="type-numeric text-lg font-bold text-fg">{formatCurrency(service.priceCents / 100, locale)}</p>
        {action}
      </div>
    </div>
  );
}
