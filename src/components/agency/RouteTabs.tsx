"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string; exact?: boolean };

// Abas que são rotas (6.1): links <a> comuns (não next/link), roláveis no celular, com aria-current.
export function RouteTabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto px-1">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <a
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                  active ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg",
                )}
              >
                {tab.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
