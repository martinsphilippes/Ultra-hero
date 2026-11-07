// Nível do conteúdo (reunião Groscove, 06/11/2026): escala de níveis de consciência de David Hawkins. Na plataforma só
// se publica do nível 400 para cima (Razão, Amor, Alegria, Paz, Iluminação). Quem publica declara o nível e aceita a
// responsabilidade (Termo do Parceiro › Padrão de conteúdo). O banco confere os mesmos valores (0127).
export const CONTENT_LEVELS = [400, 500, 540, 600, 700] as const;
export type ContentLevel = (typeof CONTENT_LEVELS)[number];

export function isContentLevel(value: unknown): value is ContentLevel {
  return typeof value === "number" && (CONTENT_LEVELS as readonly number[]).includes(value);
}
