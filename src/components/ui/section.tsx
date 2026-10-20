import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Link "ver tudo". */
  href?: string;
  seeAllLabel?: ReactNode;
  /** Ação alternativa à direita. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Permite rolagem horizontal do conteúdo (carrosséis). */
  scroll?: boolean;
  id?: string;
};

// Seção de página: título + "ver tudo" + conteúdo.
export function Section({ title, description, href, seeAllLabel, action, children, className, scroll = false, id }: SectionProps) {
  const t = useTranslations("common.actions");
  return (
    <section id={id} className={cn("flex flex-col gap-3", className)} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={id ? `${id}-title` : undefined} className="type-h2 text-fg">
            {title}
          </h2>
          {description && <p className="type-body-sm text-fg-muted">{description}</p>}
        </div>
        {href ? (
          <Link
            href={href}
            className="inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-md pl-2 text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {seeAllLabel ?? t("seeAll")}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          action
        )}
      </div>
      {scroll ? (
        <div className="-mx-gutter flex gap-3 overflow-x-auto px-gutter pb-1 scrollbar-none snap-x snap-mandatory [&>*]:snap-start [&>*]:shrink-0">
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
