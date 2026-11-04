import { CalendarClock, Sparkles, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import type { PlatformInfo } from "@/lib/platform-calendar/vocab";
import { TERRITORY_VARIANT } from "./territories";

/** Nome legível da coleção (linha do calendário): traduzido quando conhecido, senão o próprio slug. */
export function useCollectionLabel() {
  const t = useTranslations("groscoveCalendar.collections");
  return (slug: string) => (t.has(slug) ? t(slug) : slug.replace(/-/g, " "));
}

type Props = { info: PlatformInfo; showStatus?: boolean; size?: "sm" | "md" };

// Selos de um evento do Calendário Groscove (0098): o selo da plataforma, o território (na cor dele), "data a
// confirmar", destaque e — para quem administra ou quando cancelado — o estado. Funciona no servidor e no cliente.
export function PlatformBadges({ info, showStatus = false, size = "sm" }: Props) {
  const t = useTranslations("groscoveCalendar");
  return (
    <span className="flex flex-wrap items-center gap-1.5" data-testid="platform-badges">
      <Badge size={size} variant="accent" icon={<Sparkles />}>
        {t("badge")}
      </Badge>
      {info.territory ? (
        <Badge size={size} variant={TERRITORY_VARIANT[info.territory]} data-territory={info.territory}>
          {t(`territories.${info.territory}`)}
        </Badge>
      ) : null}
      {info.status === "cancelled" ? (
        <Badge size={size} variant="danger">
          {t("status.cancelled")}
        </Badge>
      ) : showStatus && info.status !== "published" ? (
        <Badge size={size} variant={info.status === "draft" ? "neutral" : "info"}>
          {t(`status.${info.status}`)}
        </Badge>
      ) : null}
      {info.tentative ? (
        <Badge size={size} variant="warning" icon={<CalendarClock />} data-testid="platform-tentative">
          {t("tentative")}
        </Badge>
      ) : null}
      {info.highlight ? (
        <Badge size={size} variant="success" icon={<Star />}>
          {t("highlight")}
        </Badge>
      ) : null}
    </span>
  );
}
