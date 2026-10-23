// Correção local do otimizador de imagens do `next start` (Next 15.5.28), aplicada no postinstall.
//
// Defeito: para imagem local (/content/*.webp etc.), fetchInternalImage monta uma requisição falsa e
// passa a ela o SOCKET da requisição do navegador. Se o navegador desiste da imagem no meio (trocou de
// página, fechou a aba — o que os E2E fazem o tempo todo), o socket já está destruído: o servidor de
// arquivos estáticos vê a resposta falsa como "terminada", destrói o arquivo sem escrever e a promessa
// `hasStreamed` nunca resolve. A otimização daquela chave (url + largura + qualidade + formato) fica
// pendurada para sempre, e o cache de respostas faz todo pedido seguinte da mesma chave esperar por
// ela: a página nunca dispara o "load" (page.goto estoura o tempo nos testes das páginas de herói).
// Em produção a Vercel otimiza as imagens no serviço dela, fora deste código, por isso lá passa.
//
// A correção não passa o socket do navegador (a requisição falsa usa o socket simulado do próprio
// Next, como em qualquer chamada interna). Só mexe na versão conferida; em outra versão, avisa e sai.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const VERSION = "15.5.28";
const ORIGINAL = "            socket: _req.socket,\n            maximumResponseBody\n";
const PATCHED = "            // socket: _req.socket, (uh-patch: socket do navegador abortado prendia a otimização)\n            maximumResponseBody\n";

const require = createRequire(import.meta.url);
let pkgPath;
try {
  pkgPath = require.resolve("next/package.json");
} catch {
  console.log("[patch-next-image] next não instalado; nada a fazer");
  process.exit(0);
}
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
const file = path.join(path.dirname(pkgPath), "dist", "server", "image-optimizer.js");
const source = readFileSync(file, "utf8");

if (source.includes(PATCHED)) {
  console.log(`[patch-next-image] next ${version}: já corrigido`);
} else if (version !== VERSION) {
  console.warn(`[patch-next-image] next ${version} (correção feita para ${VERSION}): confira se o defeito ainda existe e atualize ou remova este script`);
} else if (!source.includes(ORIGINAL)) {
  console.warn(`[patch-next-image] next ${version}: trecho esperado não encontrado; nada alterado`);
} else {
  writeFileSync(file, source.replace(ORIGINAL, PATCHED));
  console.log(`[patch-next-image] next ${version}: fetchInternalImage não usa mais o socket do navegador`);
}
