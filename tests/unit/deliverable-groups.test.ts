import { describe, expect, it } from "vitest";
import {
  distinctCombos,
  expandDeliverableGroups,
  expandGroup,
  expandValidGroups,
  groupCombos,
  groupDeliverables,
  groupPieces,
  groupProblem,
  MAX_DELIVERABLE_COMBOS,
  newGroup,
  toggleIn,
  type DeliverableGroup,
} from "@/lib/deals/deliverable-groups";
import { requestDeliverablesSchema, type RequestDeliverable } from "@/lib/deals/schemas";
import { DELIVERABLE_KINDS } from "@/lib/deals/vocab";
import { NETWORKS } from "@/lib/talent/vocab";

const key = (d: RequestDeliverable) => `${d.kind}|${d.network ?? ""}|${d.quantity}`;
const multiset = (list: readonly RequestDeliverable[]) => list.map(key).sort();

describe("expansão tipo × rede", () => {
  it("cada tipo em cada rede, com a mesma quantidade, na ordem do vocabulário", () => {
    const g: DeliverableGroup = { kinds: ["reels", "post"], networks: ["tiktok", "instagram"], quantity: 2 };
    expect(expandGroup(g)).toEqual([
      { kind: "post", quantity: 2, network: "instagram" },
      { kind: "post", quantity: 2, network: "tiktok" },
      { kind: "reels", quantity: 2, network: "instagram" },
      { kind: "reels", quantity: 2, network: "tiktok" },
    ]);
    expect(groupCombos(g)).toBe(4);
    expect(groupPieces(g)).toBe(8);
  });

  it("o resultado passa no schema do banco", () => {
    const r = expandDeliverableGroups([{ kinds: ["post", "stories"], networks: ["groscove_ultra", "instagram"], quantity: 3 }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(requestDeliverablesSchema.safeParse(r.items).success).toBe(true);
  });

  it("valida pelo menos um tipo e uma rede por linha (aponta a linha)", () => {
    expect(groupProblem({ kinds: [], networks: ["instagram"], quantity: 1 })).toBe("kindRequired");
    expect(groupProblem({ kinds: ["post"], networks: [], quantity: 1 })).toBe("networkRequired");
    const r = expandDeliverableGroups([newGroup("post", ["instagram"]), { kinds: ["post"], networks: [], quantity: 1 }]);
    expect(r).toEqual({ ok: false, problem: "networkRequired", row: 1 });
  });

  it("no máximo 30 combinações no total", () => {
    const g: DeliverableGroup = { kinds: ["post", "reels", "stories"], networks: NETWORKS.slice(0, 10), quantity: 1 };
    expect(expandDeliverableGroups([g]).ok).toBe(true); // 3 × 10 = 30
    expect(expandDeliverableGroups([g, newGroup("live", ["instagram"])])).toEqual({ ok: false, problem: "tooMany", row: null });
    expect(MAX_DELIVERABLE_COMBOS).toBe(30);
  });

  it("quantidade fica entre 1 e 100", () => {
    expect(expandGroup({ kinds: ["post"], networks: ["x"], quantity: 500 })[0].quantity).toBe(100);
    expect(expandGroup({ kinds: ["post"], networks: ["x"], quantity: 0 })[0].quantity).toBe(1);
  });

  it("expandValidGroups ignora linhas incompletas", () => {
    expect(expandValidGroups([{ kinds: [], networks: ["x"], quantity: 1 }, newGroup("live", ["kwai"])])).toEqual([{ kind: "live", quantity: 1, network: "kwai" }]);
  });

  it("toggleIn liga/desliga mantendo a ordem do vocabulário (Groscove Ultra primeiro)", () => {
    expect(toggleIn(NETWORKS, ["tiktok"], "groscove_ultra")).toEqual(["groscove_ultra", "tiktok"]);
    expect(toggleIn(NETWORKS, ["groscove_ultra", "tiktok"], "groscove_ultra")).toEqual(["tiktok"]);
    expect(toggleIn(DELIVERABLE_KINDS, ["live"], "post")).toEqual(["post", "live"]);
  });

  it("distinctCombos conta pares tipo + rede diferentes", () => {
    expect(distinctCombos([{ kind: "post", quantity: 1, network: "x" }, { kind: "post", quantity: 3, network: "x" }, { kind: "post", quantity: 1, network: null }])).toBe(2);
  });
});

describe("reagrupamento ao editar", () => {
  it("junta redes do mesmo tipo e tipos com as mesmas redes e quantidade", () => {
    const items: RequestDeliverable[] = [
      { kind: "post", quantity: 2, network: "instagram" },
      { kind: "reels", quantity: 2, network: "instagram" },
      { kind: "post", quantity: 2, network: "tiktok" },
      { kind: "reels", quantity: 2, network: "tiktok" },
      { kind: "live", quantity: 1, network: "youtube" },
    ];
    expect(groupDeliverables(items)).toEqual([
      { kinds: ["post", "reels"], networks: ["instagram", "tiktok"], quantity: 2 },
      { kinds: ["live"], networks: ["youtube"], quantity: 1 },
    ]);
  });

  it("não junta quantidades diferentes nem conjuntos de redes diferentes", () => {
    const items: RequestDeliverable[] = [
      { kind: "post", quantity: 2, network: "instagram" },
      { kind: "reels", quantity: 3, network: "instagram" },
      { kind: "stories", quantity: 2, network: "instagram" },
      { kind: "stories", quantity: 2, network: "tiktok" },
    ];
    expect(groupDeliverables(items)).toEqual([
      { kinds: ["post"], networks: ["instagram"], quantity: 2 },
      { kinds: ["reels"], networks: ["instagram"], quantity: 3 },
      { kinds: ["stories"], networks: ["instagram", "tiktok"], quantity: 2 },
    ]);
  });

  it("item sem rede (dado antigo) e item repetido ficam em linhas próprias", () => {
    const items: RequestDeliverable[] = [
      { kind: "post", quantity: 1, network: null },
      { kind: "reels", quantity: 1, network: "instagram" },
      { kind: "reels", quantity: 1, network: "instagram" },
    ];
    const groups = groupDeliverables(items);
    expect(groups).toEqual([
      { kinds: ["post"], networks: [], quantity: 1 },
      { kinds: ["reels"], networks: ["instagram"], quantity: 1 },
      { kinds: ["reels"], networks: ["instagram"], quantity: 1 },
    ]);
    // sem rede: a tela pede para escolher antes de salvar
    expect(expandDeliverableGroups(groups)).toEqual({ ok: false, problem: "networkRequired", row: 0 });
  });

  it("é determinístico e salvar de novo sem mexer gera os mesmos itens (ida e volta)", () => {
    // gerador simples e fixo (sem aleatoriedade): várias listas com repetições e quantidades variadas
    let seed = 7;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let round = 0; round < 200; round++) {
      const size = 1 + next(12);
      const items: RequestDeliverable[] = Array.from({ length: size }, () => ({
        kind: DELIVERABLE_KINDS[next(4)],
        quantity: 1 + next(3),
        network: NETWORKS[next(4)],
      }));
      const groups = groupDeliverables(items);
      expect(groupDeliverables(items)).toEqual(groups);
      const back = expandDeliverableGroups(groups);
      expect(back.ok).toBe(true);
      if (back.ok) {
        expect(multiset(back.items)).toEqual(multiset(items));
        // reagrupar o que sai dá as mesmas linhas (ponto fixo)
        expect(groupDeliverables(back.items).map((g) => expandGroup(g).map(key).sort())).toEqual(groups.map((g) => expandGroup(g).map(key).sort()));
      }
    }
  });

  it("lista vazia → nenhuma linha", () => {
    expect(groupDeliverables([])).toEqual([]);
    expect(expandDeliverableGroups([])).toEqual({ ok: true, items: [] });
  });
});
