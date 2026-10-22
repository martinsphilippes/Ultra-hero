#!/usr/bin/env node
// Aplica migrations no projeto Supabase remoto pela Management API (HTTPS).
// Uso: SUPABASE_ACCESS_TOKEN=... node scripts/db/remote-apply.mjs [--from 0006] [--only 0008_seed] [--dry]
// Cada arquivo roda numa única requisição (transação); o registro vai para supabase_migrations.schema_migrations.
// Arquivo com a linha "-- remote-apply: manual" (ex.: 0029, que exige dry-run no meio) é recusado:
// segue o roteiro manual do documento indicado no cabeçalho dele.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "cjcvlfypjoxaynwtmuhz";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("Defina SUPABASE_ACCESS_TOKEN (Supabase → Account → Access Tokens).");
  process.exit(1);
}

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const from = getArg("--from");
const only = getArg("--only");
const dry = args.includes("--dry");

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .filter((f) => (!from || f >= from) && (!only || f.startsWith(only)));

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 2000)}`);
  return text ? JSON.parse(text) : null;
}

const applied = new Set(
  ((await query("select name from supabase_migrations.schema_migrations")) ?? []).map((r) => r.name),
);

for (const file of files) {
  const name = file.replace(/\.sql$/, "");
  if (applied.has(name)) {
    console.log(`= ${name} (já aplicada)`);
    continue;
  }
  const sql = readFileSync(path.join(dir, file), "utf8");
  // Para antes de aplicar qualquer coisa depois dela: a ordem das migrações importa.
  if (/^-- remote-apply: manual$/m.test(sql)) {
    console.error(`  PARADO: ${name} é de aplicação manual em partes (ver o cabeçalho do arquivo).`);
    process.exit(3);
  }
  console.log(`${dry ? "(dry) " : ""}> ${name} (${sql.length} bytes)`);
  if (dry) continue;
  const started = Date.now();
  // transação única: migration + registro
  const wrapped = `begin;\n${sql}\ninsert into supabase_migrations.schema_migrations (version, name, statements) values (to_char(clock_timestamp() at time zone 'utc', 'YYYYMMDDHH24MISS'), '${name}', array['applied via scripts/db/remote-apply.mjs']);\ncommit;`;
  try {
    await query(wrapped);
    console.log(`  ok em ${Date.now() - started} ms`);
  } catch (e) {
    console.error(`  FALHOU: ${e.message}`);
    process.exit(2);
  }
}
console.log("Concluído.");
