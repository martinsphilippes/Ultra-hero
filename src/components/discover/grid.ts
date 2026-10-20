// Classes compartilhadas de layout dos cards do módulo Descobrir.
export const CARD_GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
export const CARD_GRID_4 = "grid gap-4 grid-cols-2 lg:grid-cols-4";
export const SCROLL_CARD = "w-[16.5rem] sm:w-[18rem]";

// Trilho: rola na horizontal no mobile (sangrando até a borda) e vira grade no desktop.
export const RAIL =
  "-mx-gutter flex gap-3 overflow-x-auto px-gutter pb-1 scrollbar-none snap-x snap-mandatory md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4";
export const RAIL_ITEM = "w-[16.5rem] shrink-0 snap-start sm:w-[18rem] md:w-auto";
