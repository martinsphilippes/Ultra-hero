import { NETWORKS, type Network } from "@/lib/talent/vocab";
import type { RequestDeliverable } from "./schemas";
import { DELIVERABLE_KINDS, type DeliverableKind } from "./vocab";

// Linhas de entregáveis com vários tipos e várias redes (pedido do responsável, 04/11: "tem que ser possível
// assinalar mais de um tipo e mais de uma rede"). O formato salvo no banco NÃO muda: cada linha vira, ao salvar,
// as combinações tipo × rede, cada uma com a mesma quantidade ({kind, quantity, network}, até 30 itens — o limite
// de campaign_deliverables_valid). Ao abrir um rascunho, os itens são reagrupados de forma determinística
// (groupDeliverables): mesmo tipo + mesma quantidade juntam as redes; depois, tipos com a mesma quantidade e o mesmo
// conjunto de redes viram uma linha só. Item sem rede (dados antigos) ou repetido fica numa linha própria, para
// que salvar de novo sem mexer gere exatamente os mesmos itens (a ordem pode mudar). Testes:
// tests/unit/deliverable-groups.test.ts.

/** Máximo de itens (combinações tipo × rede) numa lista — o mesmo teto do banco. */
export const MAX_DELIVERABLE_COMBOS = 30;
export const MAX_DELIVERABLE_QUANTITY = 100;

export type DeliverableGroup = { kinds: DeliverableKind[]; networks: Network[]; quantity: number };
export type GroupProblem = "kindRequired" | "networkRequired" | "tooMany";
export type GroupsResult = { ok: true; items: RequestDeliverable[] } | { ok: false; problem: GroupProblem; row: number | null };

const inOrder = <T extends string>(vocab: readonly T[], list: readonly T[]): T[] => vocab.filter((x) => list.includes(x));
const clampQty = (n: number) => Math.max(1, Math.min(MAX_DELIVERABLE_QUANTITY, Math.trunc(Number.isFinite(n) ? n : 1)));

/** Liga/desliga um item da seleção, devolvendo na ordem do vocabulário (Groscove Ultra primeiro nas redes). */
export function toggleIn<T extends string>(vocab: readonly T[], list: readonly T[], item: T): T[] {
  return list.includes(item) ? inOrder(vocab, list.filter((x) => x !== item)) : inOrder(vocab, [...list, item]);
}

/** Quantas combinações (itens salvos) uma linha gera. */
export function groupCombos(g: DeliverableGroup): number {
  return inOrder(DELIVERABLE_KINDS, g.kinds).length * inOrder(NETWORKS, g.networks).length;
}

/** Quantas peças uma linha gera (combinações × quantidade). */
export function groupPieces(g: DeliverableGroup): number {
  return groupCombos(g) * clampQty(g.quantity);
}

export function groupProblem(g: DeliverableGroup): GroupProblem | null {
  if (inOrder(DELIVERABLE_KINDS, g.kinds).length === 0) return "kindRequired";
  if (inOrder(NETWORKS, g.networks).length === 0) return "networkRequired";
  return null;
}

/** Uma linha → itens tipo × rede (tipos e redes na ordem do vocabulário). */
export function expandGroup(g: DeliverableGroup): RequestDeliverable[] {
  const quantity = clampQty(g.quantity);
  const out: RequestDeliverable[] = [];
  for (const kind of inOrder(DELIVERABLE_KINDS, g.kinds)) for (const network of inOrder(NETWORKS, g.networks)) out.push({ kind, quantity, network });
  return out;
}

/** Todas as linhas → itens para salvar, ou o primeiro problema (linha 0-based; null quando é o total). */
export function expandDeliverableGroups(groups: readonly DeliverableGroup[]): GroupsResult {
  for (let i = 0; i < groups.length; i++) {
    const problem = groupProblem(groups[i]);
    if (problem) return { ok: false, problem, row: i };
  }
  const items = groups.flatMap(expandGroup);
  if (items.length > MAX_DELIVERABLE_COMBOS) return { ok: false, problem: "tooMany", row: null };
  return { ok: true, items };
}

/** Só as linhas válidas expandidas (para totais na tela enquanto o usuário ainda escolhe). */
export function expandValidGroups(groups: readonly DeliverableGroup[]): RequestDeliverable[] {
  return groups.filter((g) => groupProblem(g) === null).flatMap(expandGroup);
}

/** Quantos pares tipo + rede diferentes há numa lista (o banco soma e corta em 30 na proposta da chamada). */
export function distinctCombos(items: readonly RequestDeliverable[]): number {
  return new Set(items.map((d) => `${d.kind}|${d.network ?? ""}`)).size;
}

/** Itens salvos → linhas para editar (determinístico; ver comentário do topo). */
export function groupDeliverables(items: readonly RequestDeliverable[]): DeliverableGroup[] {
  type Entry = { order: number; group: DeliverableGroup };
  const singles: Entry[] = [];
  const seen = new Set<string>();
  // passo 1: mesmo tipo + mesma quantidade → conjunto de redes
  const byKind = new Map<string, { order: number; kind: DeliverableKind; quantity: number; networks: Network[] }>();
  items.forEach((d, i) => {
    const quantity = clampQty(d.quantity);
    const network = d.network ?? null;
    const pair = `${d.kind}|${network ?? ""}`;
    if (network === null || seen.has(pair)) {
      singles.push({ order: i, group: { kinds: [d.kind], networks: network ? [network] : [], quantity } });
      return;
    }
    seen.add(pair);
    const key = `${d.kind}|${quantity}`;
    const cur = byKind.get(key);
    if (cur) cur.networks.push(network);
    else byKind.set(key, { order: i, kind: d.kind, quantity, networks: [network] });
  });
  // passo 2: mesma quantidade + mesmo conjunto de redes → vários tipos na mesma linha
  const merged = new Map<string, Entry>();
  for (const b of byKind.values()) {
    const networks = inOrder(NETWORKS, b.networks);
    const key = `${b.quantity}|${networks.join(",")}`;
    const cur = merged.get(key);
    if (cur) {
      cur.group.kinds = inOrder(DELIVERABLE_KINDS, [...cur.group.kinds, b.kind]);
      cur.order = Math.min(cur.order, b.order);
    } else merged.set(key, { order: b.order, group: { kinds: [b.kind], networks, quantity: b.quantity } });
  }
  return [...merged.values(), ...singles].sort((a, b) => a.order - b.order).map((e) => e.group);
}

/** Linha nova: um tipo e as redes sugeridas (as redes da campanha/chamada, quando houver). */
export function newGroup(kind: DeliverableKind, networks: readonly Network[] = []): DeliverableGroup {
  return { kinds: [kind], networks: inOrder(NETWORKS, networks), quantity: 1 };
}
