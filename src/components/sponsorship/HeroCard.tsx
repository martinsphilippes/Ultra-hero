import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, Badge } from "@/components/ui";
import { heroPagePath, type HeroInfo } from "@/lib/sponsorship/hero-pick";

type Props = {
  hero: HeroInfo;
  /** agência: mostra o consentimento da ficha; marca: só a página do herói (que o banco só entrega com consentimento) */
  side: "agency" | "brand";
  className?: string;
};

// Cartão do herói da oportunidade de patrocínio (0095): foto, nome, nicho (pilares), chamada e o link da página pública.
// A marca só recebe foto, nicho e endereço quando o herói deu consentimento; sem isso o cartão traz só o nome.
export function HeroCard({ hero, side, className }: Props) {
  const t = useTranslations("sponsorship.hero");
  const tp = useTranslations("common.pillars");
  const path = heroPagePath(hero);
  return (
    <div className={`flex items-start gap-3 ${className ?? ""}`} data-testid="sponsorship-hero">
      <Avatar src={hero.avatarUrl} name={hero.name} size="md" alt="" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-fg" data-testid="sponsorship-hero-name">
            {hero.name}
          </span>
          {side === "agency" ? (
            <Badge size="sm" variant={hero.consent === "active" ? "success" : "warning"} data-consent={hero.consent}>
              {t(`consent.${hero.consent}`)}
            </Badge>
          ) : null}
          {side === "agency" && !hero.hasHero ? <Badge size="sm">{t("outside")}</Badge> : null}
          {side === "agency" && hero.hasHero && !hero.heroActive ? <Badge size="sm" variant="danger">{t("inactive")}</Badge> : null}
        </span>
        {hero.headline ? <span className="type-caption text-fg-muted">{hero.headline}</span> : null}
        {hero.pillars.length > 0 ? (
          <span className="flex flex-wrap gap-1" data-testid="sponsorship-hero-niche">
            {hero.pillars.slice(0, 4).map((p) => (
              <Badge key={p} size="sm" variant={p as "routine"}>
                {tp(p as "routine")}
              </Badge>
            ))}
          </span>
        ) : null}
        {path ? (
          <a href={path} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 self-start type-caption font-medium text-accent-text underline-offset-2 hover:underline" data-testid="sponsorship-hero-link">
            {t("seePage")}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
