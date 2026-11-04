import type { HeroStatus } from "@/lib/creator-content/rules";

// Quem pode o quê na agenda e no financeiro do herói independente (0094). O banco confere de novo (RLS).
//   • agenda: titular e membros leem; só o titular (herói não suspenso) cria, edita e exclui.
//   • financeiro: só o titular vê (membro não lê nem escreve); herói suspenso lê, mas não escreve.
export type HeroRights = {
  teamRole: "owner" | "member";
  canWriteAgenda: boolean;
  canSeeFinance: boolean;
  canWriteFinance: boolean;
};

export function heroRights(teamRole: "owner" | "member", status: HeroStatus): HeroRights {
  const owner = teamRole === "owner";
  const writable = owner && status !== "suspended";
  return { teamRole, canWriteAgenda: writable, canSeeFinance: owner, canWriteFinance: writable };
}

/**
 * Agenda e Financeiro do Portal do Herói (0097: uma tela só para cada). Com agência: os da agência e, se houver, os
 * próprios do herói ligado ao casting (ownCount = compromissos/serviços próprios). Sem agência: os próprios (0094).
 * O herói em uso que não é o do casting (ex.: membro da equipe de outro herói) mostra os próprios por inteiro.
 */
export function heroPortalSections(opts: { casting: boolean; hasHero: boolean; heroHasAgency: boolean; ownCount: number }): { agency: boolean; own: boolean } {
  return { agency: opts.casting, own: opts.hasHero && (!opts.heroHasAgency || opts.ownCount > 0) };
}
