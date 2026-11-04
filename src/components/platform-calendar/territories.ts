import type { BadgeVariant } from "@/components/ui";
import type { Territory } from "@/lib/platform-calendar/vocab";

// Cor de cada território do Calendário Groscove (0098), dentro dos tokens do tema (claro e escuro). São 11 territórios
// e 10 famílias de cor: moda e entretenimento dividem a mesma; o nome do território vai sempre escrito no selo e na
// legenda, então a cor nunca é o único sinal (acessibilidade).
export const TERRITORY_VARIANT: Record<Territory, BadgeVariant> = {
  futebol: "training",
  esporte: "info",
  entretenimento: "gastronomy",
  musica: "accent",
  geek_tech: "routine",
  social: "neutral",
  saude: "nutrition",
  varejo: "warning",
  feriados: "danger",
  moda: "gastronomy",
  sustentabilidade: "success",
};

export const TERRITORY_DOT: Record<Territory, string> = {
  futebol: "bg-pillar-training",
  esporte: "bg-info",
  entretenimento: "bg-pillar-gastronomy",
  musica: "bg-accent",
  geek_tech: "bg-pillar-routine",
  social: "bg-fg-subtle",
  saude: "bg-pillar-nutrition",
  varejo: "bg-warning",
  feriados: "bg-danger",
  moda: "bg-pillar-gastronomy",
  sustentabilidade: "bg-success",
};

/** Ponto de um item da grade: a cor do território (Calendário Groscove) ou a do tipo. */
export const GROSCOVE_DOT = "bg-accent";
