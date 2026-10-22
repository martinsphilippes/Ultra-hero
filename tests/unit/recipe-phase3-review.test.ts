import { describe, expect, it } from "vitest";
import { createLatestSaver } from "@/lib/recipes/latest-saver";
import { loadRecipeRows } from "@/lib/recipes/rows";

// Correções da revisão da fase 3: nota por estrelas sem desabilitar os rádios (a última escolha
// vence) e a receita fechada sem ler as tabelas que o modo público não mostra.

function deferred() {
  let resolve!: (value: { ok: true } | { ok: false; error: string }) => void;
  const promise = new Promise<{ ok: true } | { ok: false; error: string }>((r) => (resolve = r));
  return { promise, resolve };
}

describe("gravação em que a última escolha vence (nota por estrelas)", () => {
  it("escolhas durante a gravação não abrem outra; ao terminar, grava só a mais recente", async () => {
    const calls: number[] = [];
    const pending: ReturnType<typeof deferred>[] = [];
    const saver = createLatestSaver((value: number) => {
      calls.push(value);
      const d = deferred();
      pending.push(d);
      return d.promise;
    });
    const first = saver.submit(2);
    // setas do teclado durante a gravação: 3 e 4 só trocam o valor pendente
    expect(await saver.submit(3)).toBeNull();
    expect(await saver.submit(4)).toBeNull();
    expect(calls).toEqual([2]);
    pending[0].resolve({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual([2, 4]);
    pending[1].resolve({ ok: true });
    expect(await first).toEqual({ ok: true, value: 4 });
    // depois de terminar, uma nova escolha abre outra gravação
    const again = saver.submit(5);
    expect(calls).toEqual([2, 4, 5]);
    pending[2].resolve({ ok: true });
    expect(await again).toEqual({ ok: true, value: 5 });
  });

  it("voltar à nota que está sendo gravada não grava de novo; erro encerra a fila", async () => {
    const calls: number[] = [];
    const pending: ReturnType<typeof deferred>[] = [];
    const saver = createLatestSaver((value: number) => {
      calls.push(value);
      const d = deferred();
      pending.push(d);
      return d.promise;
    });
    const first = saver.submit(4);
    await saver.submit(3);
    await saver.submit(4);
    pending[0].resolve({ ok: true });
    expect(await first).toEqual({ ok: true, value: 4 });
    expect(calls).toEqual([4]);

    const failing = saver.submit(1);
    await saver.submit(2);
    pending[1].resolve({ ok: false, error: "failed" });
    expect(await failing).toEqual({ ok: false, error: "failed" });
    expect(calls).toEqual([4, 1]);
  });
});

// Cliente falso: registra as tabelas consultadas e devolve vazio.
function fakeClient() {
  const tables: string[] = [];
  const builder = (): Record<string, unknown> => {
    const result = { data: null, error: null };
    const b: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    for (const m of ["select", "eq", "order"]) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve(result);
    return b;
  };
  const client = {
    from(table: string) {
      tables.push(table);
      return builder();
    },
  };
  return { client: client as unknown as Parameters<typeof loadRecipeRows>[0], tables };
}

describe("leitura da receita fechada (publicOnly)", () => {
  it("lê só detalhes, categorias e mídia; extras, ingredientes, etapas, vínculos e nutrição não vão ao banco", async () => {
    const { client, tables } = fakeClient();
    const rows = await loadRecipeRows(client, "c1", { publicOnly: true });
    expect(tables.sort()).toEqual(["recipe_category_links", "recipe_details", "recipe_media"]);
    expect(rows).toMatchObject({ chefNote: null, ingredients: [], steps: [], stepIngredients: [], nutrition: null, video: null });
  });

  it("receita aberta continua lendo todas as tabelas", async () => {
    const { client, tables } = fakeClient();
    await loadRecipeRows(client, "c1", { withVideo: true });
    expect(tables.sort()).toEqual([
      "content_bodies",
      "recipe_category_links",
      "recipe_details",
      "recipe_extras",
      "recipe_ingredients",
      "recipe_media",
      "recipe_nutrition",
      "recipe_step_ingredients",
      "recipe_steps",
    ]);
  });
});
