import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { rightsDefined, type Rights } from "@/lib/offer/rights";

// Leitura dos direitos de uso estruturados (0079), igual para agência, marca e creator. Sem valores.
export function RightsView({ rights, compact = false }: { rights: Rights; compact?: boolean }) {
  const t = useTranslations("offer.rights");
  if (!rightsDefined(rights)) return <p className="type-caption text-fg-muted">{t("undefined")}</p>;
  const usage = rights.perpetual ? t("perpetual") : rights.usageMonths ? t("usageMonths", { count: rights.usageMonths }) : t("usageUndefined");
  const item = (label: string, value: string) => (
    <div className="flex flex-col">
      <dt className="type-caption text-fg-muted">{label}</dt>
      <dd className="text-sm text-fg">{value}</dd>
    </div>
  );
  return (
    <div className="flex flex-col gap-2" data-testid="rights-view">
      <dl className={compact ? "flex flex-col gap-2" : "grid gap-2 sm:grid-cols-2"}>
        {item(t("channelsLabel"), rights.channels.length > 0 ? rights.channels.map((c) => t(`channels.${c}`)).join(", ") : t("noChannels"))}
        {item(t("usage"), usage)}
        {item(t("boost"), rights.boost ? t("boostYes") : t("boostNo"))}
        {item(t("exclusivity"), rights.exclusive && rights.exclusivityMonths ? t("exclusiveYes", { count: rights.exclusivityMonths }) : t("exclusiveNo"))}
        {rights.exclusive && rights.segments.length > 0 ? item(t("segments"), rights.segments.join(", ")) : null}
        {rights.exclusive && rights.category ? item(t("category"), rights.category) : null}
        {rights.exclusive && rights.competitors.length > 0 ? item(t("competitors"), rights.competitors.join(", ")) : null}
      </dl>
      {rights.perpetual ? (
        <p className="flex items-start gap-1.5 type-caption text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t("perpetualWarning")}
        </p>
      ) : null}
    </div>
  );
}
