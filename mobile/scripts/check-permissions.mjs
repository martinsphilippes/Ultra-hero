// Lição do Quantso: a Play cobra o que o binário PEDE, e plugin injeta permissão sem avisar (o
// image-picker injetava RECORD_AUDIO). Este check lê o manifest final (expo config --type
// introspect, não o app.config.ts cru) e falha com permissão fora da lista.
// Uso: npm run check:permissions — adicionar permissão aqui pede revisão do formulário de Data Safety.
import { execFileSync } from "node:child_process";

const ALLOWED = new Set(["android.permission.INTERNET", "android.permission.VIBRATE"]);

const config = JSON.parse(execFileSync("npx", ["expo", "config", "--type", "introspect", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
const manifest = config._internal?.modResults?.android?.manifest?.manifest;
if (!manifest) {
  console.error("check-permissions: manifest do Android ausente na saída do expo config");
  process.exit(1);
}
const requested = (manifest["uses-permission"] ?? [])
  .filter((entry) => entry.$?.["tools:node"] !== "remove")
  .map((entry) => entry.$["android:name"]);
const extra = requested.filter((name) => !ALLOWED.has(name));
if (extra.length > 0) {
  console.error(`check-permissions: permissões fora da lista: ${extra.join(", ")}`);
  console.error("Bloqueie em android.blockedPermissions (app.config.ts) ou, se for de propósito, inclua em ALLOWED e revise o Data Safety.");
  process.exit(1);
}
console.log(`check-permissions: ok (${requested.join(", ")})`);
