import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decideCreatorCredentials } from "@/app/admin/creators/credentials-actions";
import { setReviewRequiredAction } from "@/app/admin/content-actions";
import { isStructuredRecipeMarker, summarizeBody, summarizeRecipeRows } from "@/components/admin-content/lib/body-summary";
import { reviewChangeAllowed, reviewToggle } from "@/components/admin-content/lib/review-required";
import { IngredientsStep } from "@/components/recipes/editor/steps/IngredientsStep";
import { Button } from "@/components/ui";
import { credentialsState } from "@/lib/recipes/credentials";
import { emptyDraft, emptyIngredient, focusIndexAfterRemove } from "@/lib/recipes/draft";
import { streamPanel } from "@/lib/recipes/video";
import commonMessages from "../../messages/pt-BR/common.json";
import recipesMessages from "../../messages/pt-BR/recipes.json";

// Correções da revisão independente da fase 2 de receitas (Portal do Chef): credenciais decididas
// sobre o texto que o admin viu, regra de revisão só onde há fluxo, resumo do admin pelas tabelas,
// envio de vídeo que não desmonta, foco depois de remover e teclado do campo de quantidade.

const server = vi.hoisted(() => ({
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  rpcResults: [] as { error: { message: string; code?: string } | null }[],
  requestText: "Chef formada pelo Senac" as string | null,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => Object.assign((key: string) => `${namespace}.${key}`, { has: () => true }),
}));
vi.mock("@/lib/auth/session", () => ({
  getUser: async () => ({ id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" }),
  hasRole: async () => true,
  requireRole: async () => undefined,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => {
        const chain = { eq: () => chain, maybeSingle: async () => ({ data: server.requestText === null ? null : { text: server.requestText }, error: null }) };
        return chain;
      },
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      server.rpcs.push({ fn, args });
      return server.rpcResults.shift() ?? { error: null };
    },
  }),
}));

const CREATOR = "a3bb189e-8bf9-4888-9912-ace4e6543002";
const WHY = "Conferido no registro";

describe("credenciais: a decisão vale para o texto que a fila mostrou", () => {
  beforeEach(() => {
    server.rpcs = [];
    server.rpcResults = [];
    server.requestText = "Chef formada pelo Senac";
  });

  it("manda o texto visto para a RPC (0032 recusa com request_changed se o herói editou)", async () => {
    server.rpcResults = [{ error: { message: "request_changed" } }];
    const result = await decideCreatorCredentials({ creatorId: CREATOR, approved: true, expectedText: "Chef formada pelo Senac" }, WHY);
    expect(server.rpcs).toEqual([{ fn: "admin_set_creator_credentials", args: { p_creator: CREATOR, p_approved: true, p_reason: WHY, p_expected_text: "Chef formada pelo Senac" } }]);
    expect(result).toEqual({ ok: false, error: "adminContent.errors.request_changed" });
  });

  it("banco sem a 0032: confere o texto antes e não chama a RPC antiga quando mudou", async () => {
    server.rpcResults = [{ error: { message: "Could not find the function", code: "PGRST202" } }];
    server.requestText = "Nutricionista CRN 12345, cura diabetes";
    const result = await decideCreatorCredentials({ creatorId: CREATOR, approved: true, expectedText: "Chef formada pelo Senac" }, WHY);
    expect(result).toEqual({ ok: false, error: "adminContent.errors.request_changed" });
    expect(server.rpcs).toHaveLength(1);
  });

  it("banco sem a 0032 e texto igual: segue pela RPC de 3 argumentos", async () => {
    server.rpcResults = [{ error: { message: "Could not find the function", code: "PGRST202" } }, { error: null }];
    const result = await decideCreatorCredentials({ creatorId: CREATOR, approved: false, expectedText: "Chef formada pelo Senac" }, WHY);
    expect(result).toMatchObject({ ok: true });
    expect(server.rpcs[1]).toEqual({ fn: "admin_set_creator_credentials", args: { p_creator: CREATOR, p_approved: false, p_reason: WHY } });
  });

  it("o herói vê 'reprovadas' pela decisão gravada no pedido; editar volta a aguardar", () => {
    const req = { text: "Chef", updated_at: "2026-10-20T10:00:00Z" };
    expect(credentialsState({ ...req, decision: "rejected" }, { credentials: null, credentials_approved_at: null }, undefined)).toBe("rejected");
    expect(credentialsState({ ...req, decision: null }, { credentials: null, credentials_approved_at: null }, undefined)).toBe("pending");
    expect(credentialsState({ ...req, decision: "approved" }, { credentials: "Chef", credentials_approved_at: "2026-10-21T00:00:00Z" }, undefined)).toBe("approved");
  });
});

describe("exigir revisão só onde o herói tem 'Enviar para revisão'", () => {
  beforeEach(() => {
    server.rpcs = [];
  });
  it("receita liga e desliga; os outros tipos só desligam", () => {
    expect(reviewToggle("recipe", false)).toBe("toggle");
    expect(reviewToggle("video", false)).toBe("locked");
    expect(reviewToggle("video", true)).toBe("offOnly");
    expect(reviewChangeAllowed("workout", true)).toBe(false);
    expect(reviewChangeAllowed("workout", false)).toBe(true);
  });
  it("a action recusa ligar para vídeo sem chamar a RPC", async () => {
    expect(await setReviewRequiredAction("video", true, WHY)).toEqual({ ok: false, error: "adminContent.errors.review_flow_unavailable" });
    expect(server.rpcs).toEqual([]);
    expect(await setReviewRequiredAction("recipe", true, WHY)).toMatchObject({ ok: true });
    expect(server.rpcs.map((r) => r.fn)).toEqual(["admin_set_review_required"]);
  });
});

describe("resumo do admin para receita estruturada", () => {
  it("o marcador do editor novo não vira '0 ingredientes · 0 passos'", () => {
    const marker = { kind: "recipe", schema: 2 };
    expect(isStructuredRecipeMarker(marker)).toBe(true);
    expect(summarizeBody("recipe", marker)).toEqual({ kind: "structured" });
  });
  it("contagens, porções e alérgenos vêm das tabelas (declarado 'nenhum' ≠ não informado)", () => {
    const details = { servings: 4, allergens_declared: true, allergens: ["egg" as const] };
    const rows = { details: details as never, ingredients: [{}, {}, {}] as never, steps: [{}, {}] as never };
    expect(summarizeRecipeRows(rows)).toEqual({ kind: "recipeStructured", ingredients: 3, steps: 2, servings: 4, allergensDeclared: true, allergens: ["egg"] });
    const undeclared = summarizeRecipeRows({ ...rows, details: { ...details, allergens_declared: false } as never });
    expect(undeclared).toMatchObject({ allergensDeclared: false, allergens: [] });
  });
});

describe("envio de vídeo pelo Stream não desmonta no meio", () => {
  const withUid = { provider: "cloudflare_stream", ref: "uid-123" };
  it("com o uid no rascunho, o componente de envio fica montado enquanto envia ou depois de falhar", () => {
    expect(streamPanel(withUid, "uploading")).toBe("uploader");
    expect(streamPanel(withUid, "failed")).toBe("uploader");
    expect(streamPanel(withUid, "idle")).toBe("current");
    expect(streamPanel({ provider: "cloudflare_stream", ref: null }, "idle")).toBe("uploader");
  });
});

describe("listas do editor", () => {
  it("depois de remover, o foco vai ao item que ficou na posição, ao anterior ou a 'Adicionar'", () => {
    expect(focusIndexAfterRemove(1, 3)).toBe(1);
    expect(focusIndexAfterRemove(2, 3)).toBe(1);
    expect(focusIndexAfterRemove(0, 1)).toBeNull();
  });

  it("quantidade (e substituição) com teclado de texto: '1/2', '2 1/2' e '1 média' no celular", () => {
    const draft = emptyDraft();
    draft.ingredients = [{ ...emptyIngredient(), name: "Leite", amount: "1/2", substitutions: [{ name: "Leite vegetal", amount: "1/2", unit: "", note: "" }] }];
    const html = renderToStaticMarkup(
      // arquivo .ts (sem JSX): o tipo do provider exige children nas props
      // eslint-disable-next-line react/no-children-prop
      createElement(NextIntlClientProvider, {
        locale: "pt-BR",
        timeZone: "America/Sao_Paulo",
        messages: { recipes: recipesMessages, common: commonMessages },
        children: createElement(IngredientsStep, { draft, setDraft: () => undefined, errorFor: () => undefined, disabled: false, announce: () => undefined }),
      }),
    );
    expect(html).toContain('data-testid="ingredient-amount"');
    expect(html).not.toContain('inputMode="decimal"');
    expect(html).not.toContain('inputmode="decimal"');
    expect(html.match(/enterKeyHint="next"|enterkeyhint="next"/gi)?.length).toBe(2);
  });

  it("links 'Ir para…' com alvo de toque de 44 px", () => {
    const html = renderToStaticMarkup(createElement(Button, { variant: "link", className: "min-h-11 px-1" }, "Ir"));
    expect(html).toContain("min-h-11");
    expect(html).not.toContain("min-h-0");
  });
});
