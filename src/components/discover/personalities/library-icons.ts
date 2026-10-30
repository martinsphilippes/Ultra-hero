import { Apple, BookOpen, Camera, ChefHat, Dumbbell, Heart, Layers, Mic, Music, Palette, Salad, ShoppingBag, Star, Sunrise, Trophy, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { LibraryIconKey } from "@/lib/heroes/library-tabs";

/** Ícones que o admin pode escolher para os atalhos do herói (0050), em lucide. */
export const LIBRARY_ICONS: Record<LibraryIconKey, LucideIcon> = {
  sunrise: Sunrise,
  camera: Camera,
  apple: Apple,
  salad: Salad,
  "chef-hat": ChefHat,
  utensils: UtensilsCrossed,
  dumbbell: Dumbbell,
  trophy: Trophy,
  layers: Layers,
  "shopping-bag": ShoppingBag,
  music: Music,
  mic: Mic,
  palette: Palette,
  star: Star,
  heart: Heart,
  "book-open": BookOpen,
};
