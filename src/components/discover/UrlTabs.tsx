"use client";

import { useTransition, type ReactNode } from "react";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui";
import { cn } from "@/lib/utils";

export type UrlTab = { value: string; label: string; href: string; icon?: ReactNode };

type Props = {
  value: string;
  tabs: UrlTab[];
  "aria-label": string;
  children: ReactNode;
  className?: string;
};

// Abas cujo estado vive na URL: trocar de aba substitui a URL (sem rolar, sem nova entrada no
// histórico) e o servidor renderiza o painel. Assim o "Voltar" sai da tela, não volta de aba em aba.
export function UrlTabs({ value, tabs, children, className, ...props }: Props) {
  const [pending, startTransition] = useTransition();

  const onValueChange = (next: string) => {
    const target = tabs.find((tab) => tab.value === next);
    if (!target || target.value === value) return;
    // carga completa sem nova entrada no histórico: o roteador do Next às vezes abortava a troca só
    // de parâmetros na mesma página (a aba não mudava)
    startTransition(() => window.location.replace(target.href));
  };

  return (
    <Tabs value={value} onValueChange={onValueChange} className={className}>
      <TabsList aria-label={props["aria-label"]}>
        {tabs.map((tab) => (
          <Tab key={tab.value} value={tab.value} icon={tab.icon}>
            {tab.label}
          </Tab>
        ))}
      </TabsList>
      <TabPanel value={value} aria-busy={pending || undefined} className={cn("transition-opacity", pending && "opacity-60")}>
        {children}
      </TabPanel>
    </Tabs>
  );
}
