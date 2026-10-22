import { cn } from "@/lib/utils";

type Tab = { value: string; label: string; href: string };

// Abas de /admin/links como links de documento (<a>, aria-current): funcionam sem JavaScript e não
// dependem do roteador do Next trocar só a query (/admin/links → ?aba=ingredientes), que abortava às
// vezes (o mesmo caso do ChipLink da fase 3).
export function LinkTabsNav({ tabs, value, label }: { tabs: Tab[]; value: string; label: string }) {
  return (
    <nav aria-label={label} className="border-b border-border">
      <ul className="flex gap-1">
        {tabs.map((tab) => {
          const current = tab.value === value;
          return (
            <li key={tab.value}>
              <a
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "relative inline-flex min-h-11 items-center px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                  current ? "text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent" : "text-fg-muted hover:text-fg",
                )}
                data-testid={`links-tab-${tab.value}`}
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
