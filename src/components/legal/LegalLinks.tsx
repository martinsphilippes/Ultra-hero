"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LEGAL_PRIVACY_HREF, LEGAL_TERMS_HREF } from "./rich-tags";

const LINKS = [
  { key: "terms", href: LEGAL_TERMS_HREF },
  { key: "privacy", href: LEGAL_PRIVACY_HREF },
] as const;

type LegalLinksProps = { className?: string; align?: "start" | "center" };

// Links para Termos de Uso e Política de Privacidade (rodapés do app, do login e das próprias páginas legais).
export function LegalLinks({ className, align = "start" }: LegalLinksProps) {
  const t = useTranslations("legal.links");
  const pathname = usePathname();

  return (
    <nav aria-label={t("nav")} className={className}>
      <ul className={cn("flex flex-wrap items-center gap-x-5", align === "center" && "justify-center")}>
        {LINKS.map(({ key, href }) => {
          const current = pathname === href;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-md text-sm font-medium underline decoration-border-strong underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  current ? "text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
