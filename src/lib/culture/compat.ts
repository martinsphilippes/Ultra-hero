// Compatibilidade no evento (0101): Heros × marcas com interesse ATIVO, a partir da lista que a RLS já filtrou (agência:
// casting próprio e marcas atendidas; admin: todos). Módulo puro, testado em tests/unit/culture.test.ts.

type InterestLike = { party: "hero" | "brand"; ownerId: string; name: string; state: "interested" | "withdrawn" };

export function compatFromInterests(items: readonly InterestLike[]): { heroes: { id: string; name: string }[]; brands: { id: string; name: string }[] } {
  const pick = (party: "hero" | "brand") =>
    items
      .filter((i) => i.party === party && i.state === "interested")
      .map((i) => ({ id: i.ownerId, name: i.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { heroes: pick("hero"), brands: pick("brand") };
}
