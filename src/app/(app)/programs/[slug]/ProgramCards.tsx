"use client";

import { HeartHandshake, ListChecks, Salad, Sparkles, Sunrise } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { ScreenCards, type Screen } from "@/components/ui/screen-cards";
import type { ProgramCardKey } from "@/lib/programs/program-cards";

// Os cards do programa (até 5): o visualizador em tela cheia é o compartilhado (components/ui/screen-cards),
// também usado pelo Hoje. Aqui só os ícones e o prefixo dos testids.

export type ProgramScreen = Screen & { body: ReactNode };
export type ProgramCard = { key: ProgramCardKey; title: string; teaser: string; screens: ProgramScreen[] };

const CARD_ICON: Record<ProgramCardKey, typeof Sparkles> = { conceito: Sparkles, "prepare-se": Sunrise, conteudo: ListChecks, nutricional: Salad, apoio: HeartHandshake };

export function ProgramCards({ cards }: { cards: ProgramCard[] }) {
  const withIcons = useMemo(
    () =>
      cards.map((card) => {
        const Icon = CARD_ICON[card.key];
        return { ...card, icon: <Icon /> };
      }),
    [cards],
  );
  return <ScreenCards testIdPrefix="program" cards={withIcons} />;
}
