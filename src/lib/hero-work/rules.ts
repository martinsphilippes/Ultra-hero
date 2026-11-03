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
