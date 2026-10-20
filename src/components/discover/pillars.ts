import { Apple, ChefHat, Dumbbell, Sunrise, type LucideIcon } from "lucide-react";
import type { Pillar } from "@/lib/supabase/helpers";

// Mapas estáticos (strings completas para o Tailwind enxergar as classes).
export const PILLAR_TEXT: Record<Pillar, string> = {
  routine: "text-pillar-routine",
  training: "text-pillar-training",
  nutrition: "text-pillar-nutrition",
  gastronomy: "text-pillar-gastronomy",
};

export const PILLAR_BG: Record<Pillar, string> = {
  routine: "bg-pillar-routine",
  training: "bg-pillar-training",
  nutrition: "bg-pillar-nutrition",
  gastronomy: "bg-pillar-gastronomy",
};

export const PILLAR_SOFT: Record<Pillar, string> = {
  routine: "bg-pillar-routine-soft border-pillar-routine/30",
  training: "bg-pillar-training-soft border-pillar-training/30",
  nutrition: "bg-pillar-nutrition-soft border-pillar-nutrition/30",
  gastronomy: "bg-pillar-gastronomy-soft border-pillar-gastronomy/30",
};

export const PILLAR_ICON: Record<Pillar, LucideIcon> = {
  routine: Sunrise,
  training: Dumbbell,
  nutrition: Apple,
  gastronomy: ChefHat,
};
