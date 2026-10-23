import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Garante a correção do otimizador de imagens do Next (scripts/patch-next-image-optimizer.mjs, idempotente)
// antes dos testes: o postinstall só roda num npm install, e um checkout que recebeu o script depois do
// install ficaria com o node_modules sem ela (next-image-patch.test.ts falharia e o next start local
// continuaria com o defeito).
export default function setup() {
  execFileSync(process.execPath, [fileURLToPath(new URL("../../scripts/patch-next-image-optimizer.mjs", import.meta.url))], { stdio: "inherit" });
}
