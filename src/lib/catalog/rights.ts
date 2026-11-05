// Direitos de nome e imagem por personalidade (RF-003, RF-004, RB-05). Regra pura, usada na
// página pública e no card: nunca apresenta como autorizado o que não está documentado e válido.
// Selo público x direitos (decisão do responsável): "Perfil ilustrativo" só identifica personagem criado pela
// plataforma (creator_profiles.is_fictional = true). Pessoa real com autorização pendente ou vencida não ganha
// selo público; nada passa a ser "autorizado" por isso (a nota de direitos continua sem afirmar autorização) e
// a pendência vira um aviso interno para a agência e a administração (needsImageAuthorization).

export type RightsStatus = "fictional" | "authorized" | "pending";

/** Estados de direitos que o admin escolhe (ordem do seletor). Fica fora do arquivo "use server":
 *  constante exportada de lá chega ao cliente como referência de servidor, não como lista. */
export const RIGHTS_STATUSES = ["fictional", "pending", "authorized"] as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Estado exibido ao público: autorização vencida (rights_valid_until < hoje) volta a "em validação". */
export function effectiveRightsStatus(status: string | null | undefined, validUntil: string | null | undefined, today: Date = new Date()): RightsStatus {
  if (status === "authorized") {
    if (validUntil) {
      const m = ISO_DATE.exec(validUntil);
      if (!m) return "pending";
      const end = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
      if (end < todayUtc) return "pending";
    }
    return "authorized";
  }
  if (status === "pending") return "pending";
  return "fictional";
}

/** Selo público "Perfil ilustrativo" (e o aviso padrão de perfil criado pela plataforma): só para Hero fictício. */
export function showsFictionalBadge(isFictional: boolean | null | undefined): boolean {
  return isFictional === true;
}

export type HeroRightsFields = {
  is_fictional: boolean | null | undefined;
  rights_status: string | null | undefined;
  rights_valid_until: string | null | undefined;
};

/** Pessoa real sem autorização de imagem válida (pendente ou vencida): aviso interno "Registrar autorização de
 *  imagem" para a agência e a administração. Hero fictício não precisa de autorização. */
export function needsImageAuthorization(hero: HeroRightsFields, today: Date = new Date()): boolean {
  if (hero.is_fictional === true) return false;
  return effectiveRightsStatus(hero.rights_status, hero.rights_valid_until, today) !== "authorized";
}
