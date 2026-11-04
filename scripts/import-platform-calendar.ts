// Calendário Groscove (0098) · gera SQL idempotente a partir dos JSON do cronograma (formato dos extratores) ou CSV.
//
// Uso:
//   npx tsx scripts/import-platform-calendar.ts arquivo1.json [arquivo2.json …] [--out saida.sql] [--update] [--tz America/Sao_Paulo]
//
// O SQL gerado (para rodar com psql ou no editor SQL do Supabase, como service role/postgres):
//   • registra uma importação por arquivo em calendar_imports (fonte, arquivo, SHA-256, ano, contagens e os metadados
//     months/quarters/legenda — guardados para a futura Real-Time Culture);
//   • insere os eventos como scope='platform', kind='institutional', PUBLICADOS (a "data a confirmar" do PDF vira o
//     selo tentative, não rascunho), com territory, hashtags, destaque, categoria, coleção (da fonte) e extra
//     (página de origem, dúvida do extrator, observação);
//   • é idempotente: source_key estável (fonte + data + título, a mesma regra da tela de importação) com
//     "on conflict do nothing" — rodar de novo não duplica. Com --update, linhas já existentes têm o conteúdo
//     atualizado (o estado — publicado/cancelado — nunca muda pelo script);
//   • linhas com erro (data impossível etc.) ficam de fora e aparecem no relatório do terminal; linhas repetidas no
//     mesmo arquivo entram uma vez só.
// Nada é enviado a banco algum por este script: ele só escreve o arquivo .sql.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildPreview, parseCsvImport, parseJsonImport, type PreviewRow } from "../src/lib/platform-calendar/import";
import { collectionFromSource, PLATFORM_DEFAULT_TZ } from "../src/lib/platform-calendar/vocab";

const args = process.argv.slice(2);
const files: string[] = [];
let out = "platform-calendar-import.sql";
let update = false;
let tz = PLATFORM_DEFAULT_TZ;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out") out = args[++i] ?? out;
  else if (args[i] === "--update") update = true;
  else if (args[i] === "--tz") tz = args[++i] ?? tz;
  else files.push(args[i]);
}
if (files.length === 0) {
  console.error("Uso: npx tsx scripts/import-platform-calendar.ts arquivo.json [...] [--out saida.sql] [--update] [--tz Fuso/IANA]");
  process.exit(1);
}
if (!/^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(tz)) {
  console.error(`Fuso inválido: ${tz}`);
  process.exit(1);
}

const lit = (v: string | null | undefined) => (v === null || v === undefined ? "null" : `'${v.replace(/'/g, "''")}'`);
const jsonLit = (v: unknown) => `${lit(JSON.stringify(v))}::jsonb`;
const arrLit = (list: string[]) => (list.length === 0 ? "'{}'::text[]" : `array[${list.map(lit).join(", ")}]::text[]`);

const parts: string[] = [
  "-- Calendário Groscove · importação gerada por scripts/import-platform-calendar.ts (idempotente)",
  `-- ${new Date().toISOString()} · arquivos: ${files.map((f) => path.basename(f)).join(", ")}`,
  "begin;",
];
let problems = 0;

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const name = path.basename(file);
  const parsed = /\.csv$/i.test(name) ? parseCsvImport(text, name.replace(/\.csv$/i, "")) : parseJsonImport(text, name.replace(/\.json$/i, ""));
  if (!parsed.ok) {
    console.error(`${name}: não deu para ler (${parsed.error})`);
    process.exit(1);
  }
  const f = parsed.file;
  const rows = buildPreview(f, []);
  const bad = rows.filter((r) => r.errors.length > 0);
  const repeated = rows.filter((r) => r.duplicate?.kind === "file");
  const good = rows.filter((r) => r.errors.length === 0 && r.duplicate?.kind !== "file");
  for (const r of bad) {
    problems++;
    console.warn(`${name} linha ${r.index + 1} "${r.title}" ${r.startDate}: ${r.errors.join(", ")} — fica de fora`);
  }
  const collection = collectionFromSource(f.source);
  const hash = createHash("sha256").update(text).digest("hex");
  const values = good.map((r: PreviewRow) => {
    const end = r.endDate || r.startDate;
    const extra: Record<string, unknown> = {};
    if (r.sourcePage !== null) extra.source_page = r.sourcePage;
    if (r.uncertain) extra.uncertain = true;
    if (r.note.trim()) extra.note = r.note.trim().slice(0, 1000);
    return `(${[
      lit(r.sourceKey),
      lit(r.title),
      lit(r.description.slice(0, 2000)),
      `(${lit(r.startDate)}::date)::timestamp at time zone ${lit(tz)}`,
      `(${lit(end)}::date + 1)::timestamp at time zone ${lit(tz)}`,
      lit(r.territory),
      arrLit(r.hashtags),
      r.highlight ? "true" : "false",
      r.tentative ? "true" : "false",
      lit(r.category.trim() ? r.category.trim().slice(0, 60) : null),
      jsonLit(extra),
    ].join(", ")})`;
  });
  const meta = { ...f.meta, generated_by: "scripts/import-platform-calendar.ts" };
  const conflict = update
    ? `on conflict (source_key) where scope = 'platform' do update set title = excluded.title, description = excluded.description, starts_at = excluded.starts_at,
      ends_at = excluded.ends_at, all_day = true, timezone = excluded.timezone, territory = excluded.territory, hashtags = excluded.hashtags,
      highlight = excluded.highlight, tentative = excluded.tentative, category = excluded.category, collection = excluded.collection,
      extra = excluded.extra, import_id = excluded.import_id`
    : "on conflict (source_key) where scope = 'platform' do nothing";
  parts.push(
    `-- ${name}: ${f.source} · ${rows.length} linhas (${good.length} válidas, ${bad.length} com erro, ${repeated.length} repetidas no arquivo)`,
    `do $imp$
declare v_imp uuid; v_n int;
begin
  insert into public.calendar_imports (source_name, file_name, file_hash, format, year, meta)
  values (${lit(f.source || name)}, ${lit(name)}, ${lit(hash)}, 'script', ${f.year ?? "null"}, ${jsonLit(meta)})
  returning id into v_imp;
  insert into public.calendar_events (scope, agency_id, kind, source, status, published_at, all_day, timezone, collection, import_id,
                                      source_key, title, description, starts_at, ends_at, territory, hashtags, highlight, tentative, category, extra)
  select 'platform', null, 'institutional', 'import', 'published', now(), true, ${lit(tz)}, ${lit(collection)}, v_imp,
         v.source_key, v.title, v.description, v.starts_at, v.ends_at, v.territory, v.hashtags, v.highlight, v.tentative, v.category, v.extra
  from (values
    ${values.join(",\n    ")}
  ) as v(source_key, title, description, starts_at, ends_at, territory, hashtags, highlight, tentative, category, extra)
  ${conflict};
  get diagnostics v_n = row_count;
  update public.calendar_imports set counts = jsonb_build_object('rows', ${rows.length}, ${update ? "'created_or_updated'" : "'created'"}, v_n, 'skipped', ${good.length} - v_n, 'errors', ${bad.length}, 'repeated', ${repeated.length})
  where id = v_imp;
  raise notice '${name.replace(/'/g, "")}: % eventos gravados de ${good.length}', v_n;
end $imp$;`,
  );
  console.log(`${name}: ${good.length} eventos válidos (${rows.filter((r) => r.tentative).length} com data a confirmar), ${bad.length} com erro, ${repeated.length} repetidos · coleção "${collection}"`);
}

parts.push("commit;", "");
writeFileSync(out, parts.join("\n"));
console.log(`SQL gravado em ${out}${problems > 0 ? ` (${problems} linha(s) com erro ficaram de fora)` : ""}`);
