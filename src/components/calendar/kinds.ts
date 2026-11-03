import type { BadgeVariant } from "@/components/ui";
import type { EventKind } from "@/lib/calendar/vocab";

// Cores por tipo de evento (bloco 9): o selo da lista e o ponto da grade usam a mesma família de cor, para a
// legenda valer nos dois. Oito tipos, oito cores distintas dentro dos tokens do tema (claro e escuro).
export const KIND_VARIANT: Record<EventKind, BadgeVariant> = {
  campaign: "success",
  deliverable: "info",
  consult_deadline: "danger",
  meeting: "accent",
  recording: "gastronomy",
  commercial_date: "warning",
  sponsorship: "routine",
  brand_call: "training",
  hero_event: "nutrition",
  hero_service: "warning",
  other: "neutral",
};

/** Classe de fundo do ponto/marcador do tipo na grade. */
export const KIND_DOT: Record<EventKind, string> = {
  campaign: "bg-success",
  deliverable: "bg-info",
  consult_deadline: "bg-danger",
  meeting: "bg-accent",
  recording: "bg-pillar-gastronomy",
  commercial_date: "bg-warning",
  sponsorship: "bg-pillar-routine",
  brand_call: "bg-pillar-training",
  hero_event: "bg-pillar-nutrition",
  hero_service: "bg-warning",
  other: "bg-fg-subtle",
};
