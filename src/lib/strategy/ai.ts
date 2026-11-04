import "server-only";

// Gancho de IA das estratégias (0111, D3): OPCIONAL. Nenhuma chave de IA está configurada no servidor, então a tela
// diz "não configurado" e tudo funciona sem ela (a ideia é escrita pela equipe). Para ligar no futuro: implementar
// draftStrategyIdea com o provedor escolhido (atrás de uma variável de ambiente com a chave), fazer strategyAiStatus
// responder "ready" só quando ela existir e marcar a ideia
// com ai_assisted = true (a coluna já existe). Nada aqui finge uma resposta.

export type StrategyAiStatus = "not_configured" | "ready";

/** Sem provedor implementado, sempre "não configurado" (a tela mostra isso e segue sem IA). */
export function strategyAiStatus(): StrategyAiStatus {
  return "not_configured";
}

export type StrategyAiInput = { brand: string; segment: string | null; hero: string | null; event: string | null; date: string | null; posts: string[] };

/** Rascunho de ideia por IA — sem provedor ligado, devolve "não configurado" (nunca inventa texto). */
export async function draftStrategyIdea(input: StrategyAiInput): Promise<{ ok: false; reason: StrategyAiStatus } | { ok: true; title: string; body: string }> {
  void input;
  return { ok: false, reason: "not_configured" };
}
