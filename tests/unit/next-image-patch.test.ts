import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// O postinstall (scripts/patch-next-image-optimizer.mjs) tira do otimizador local do Next o socket do
// navegador: com ele, uma imagem abortada no meio deixava a mesma chave pendurada para sempre e as
// páginas com capas não terminavam de carregar no `next start` (E2E das páginas de herói).
const require = createRequire(import.meta.url);

describe("otimizador de imagens do next start", () => {
  it("fetchInternalImage não repassa o socket da requisição do navegador", () => {
    const source = readFileSync(require.resolve("next/dist/server/image-optimizer.js"), "utf8");
    const start = source.indexOf("async function fetchInternalImage");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("\n}\n", start));
    expect(body).toContain("createRequestResponseMocks");
    // o globalSetup do Vitest (tests/setup/patch-next.ts) já roda o script antes dos testes
    expect(body, "node_modules sem a correção: rode `node scripts/patch-next-image-optimizer.mjs` (ou npm install)").not.toMatch(
      /^\s*socket: _req\.socket,/m,
    );
  });
});
