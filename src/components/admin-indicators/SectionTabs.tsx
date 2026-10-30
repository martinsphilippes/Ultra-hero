import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { INDICATOR_SECTIONS, indicatorsHref, type IndicatorPeriod, type IndicatorSection } from "@/lib/indicators";
import { cn } from "@/lib/utils";

// Abas das seções (links: funcionam sem JS; o período segue junto). Rolagem lateral no celular.
export async function SectionTabs({ active, period }: { active: IndicatorSection; period: IndicatorPeriod }) {
  const t = await getTranslations("adminOps.indicators");
  return (
    <nav aria-label={t("sectionsLabel")} className="-mx-gutter overflow-x-auto border-b border-border px-gutter md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1">
        {INDICATOR_SECTIONS.map((section) => {
          const current = section === active;
          return (
            <li key={section}>
              <Link
                href={indicatorsHref(section, period)}
                scroll={false}
                aria-current={current ? "page" : undefined}
                data-testid={`indicator-tab-${section}`}
                className={cn(
                  "relative inline-flex min-h-11 items-center whitespace-nowrap px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                  current ? "text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent" : "text-fg-muted hover:text-fg",
                )}
              >
                {t(`sections.${section}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
