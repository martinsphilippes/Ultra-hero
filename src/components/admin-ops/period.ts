// Períodos dos painéis do admin (7/14/30 dias). Fica fora do PeriodSelector ("use client") porque
// as páginas (Server Components) leem ?days= com parsePeriod: função de arquivo cliente não pode ser
// chamada no servidor.
export const PERIODS = ["7", "14", "30"] as const;
export type Period = (typeof PERIODS)[number];

export function parsePeriod(raw: string | undefined): Period {
  return (PERIODS as readonly string[]).includes(raw ?? "") ? (raw as Period) : "14";
}
