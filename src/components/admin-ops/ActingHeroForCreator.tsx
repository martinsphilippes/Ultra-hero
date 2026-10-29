import { getActingHero } from "@/lib/acting-hero/server";
import { ActingHeroBanner } from "./ActingHeroBanner";

// Telas do admin abertas por um atalho de "Publicar como hero" (?creator=<id>): a mesma faixa do
// portal quando o filtro é o herói escolhido.
export async function ActingHeroForCreator({ creatorId }: { creatorId: string | null }) {
  if (!creatorId) return null;
  const acting = await getActingHero();
  if (acting.status !== "ok" || acting.hero.id !== creatorId) return null;
  return <ActingHeroBanner hero={acting.hero} />;
}
