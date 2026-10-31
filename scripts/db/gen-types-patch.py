#!/usr/bin/env python3
"""Acrescenta a database.types.ts as tabelas e funções novas de uma migração, lidas do banco local.

Uso: python3 scripts/db/gen-types-patch.py <banco> --tables t1,t2 --functions f1,f2 [--columns tabela.coluna,...]
O arquivo segue o formato do gerador do Supabase (mesmo estilo das entradas existentes). Tabelas e funções
que já existem no arquivo são substituídas; colunas novas em tabelas antigas entram com --columns.
"""
import argparse
import re
import subprocess

TYPES = "src/lib/supabase/database.types.ts"

PG_TO_TS = {
    "uuid": "string", "text": "string", "citext": "string", "character varying": "string", "date": "string",
    "timestamp with time zone": "string", "timestamp without time zone": "string", "time without time zone": "string",
    "boolean": "boolean", "smallint": "number", "integer": "number", "bigint": "number", "numeric": "number",
    "real": "number", "double precision": "number", "jsonb": "Json", "json": "Json", "inet": "unknown",
}


def q(db: str, sql: str) -> list[list[str]]:
    out = subprocess.run(["su", "postgres", "-c", f"psql -d {db} -At -F '\x1f' -c \"{sql}\""], capture_output=True, text=True, check=True).stdout
    return [line.split("\x1f") for line in out.splitlines() if line]


def ts_type(data_type: str, udt: str) -> str:
    if data_type == "ARRAY":
        base = udt.lstrip("_")
        return {"uuid": "string[]", "text": "string[]", "int4": "number[]"}.get(base, "unknown[]")
    if data_type == "USER-DEFINED":
        return f'Database["public"]["Enums"]["{udt}"]' if udt not in ("citext",) else "string"
    return PG_TO_TS.get(data_type, "unknown")


def table_entry(db: str, table: str) -> str:
    cols = q(db, f"select column_name, data_type, udt_name, is_nullable, coalesce(column_default, '') from information_schema.columns where table_schema = 'public' and table_name = '{table}' order by column_name")
    row, ins = [], []
    for name, dt, udt, nullable, default in cols:
        t = ts_type(dt, udt)
        if t == "Json" and nullable == "NO":
            t = "NonNullable<Json>"
        null = " | null" if nullable == "YES" else ""
        row.append(f'"{name}": {t}{null}')
        optional = "?" if (nullable == "YES" or default) else ""
        ins.append(f'"{name}"{optional}: {t}{null}')
    upd = [re.sub(r'^("[^"]+")\??:', r'\1?:', c) for c in ins]
    fks = q(db, f"select c.conname, (select string_agg(a.attname, ',' order by a.attnum) from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any (c.conkey)), cl.relname from pg_constraint c join pg_class cl on cl.oid = c.confrelid join pg_namespace n on n.oid = cl.relnamespace where c.contype = 'f' and c.conrelid = 'public.{table}'::regclass and n.nspname = 'public' order by c.conname")
    rels = []
    for name, columns, ref in fks:
        cols_ts = ", ".join(f'"{c}"' for c in columns.split(","))
        rels.append(f"""{{
      foreignKeyName: "{name}"
      columns: [{cols_ts}]
isOneToOne: false
      referencedRelation: "{ref}"
      referencedColumns: ["id"]
    }}""")
    return f""""{table}": {{
                  Row: {{
                    {",".join(row)}
                  }}
                  ComputedFields: never
                  Insert: {{
                    {",".join(ins)}
                  }}
                  Update: {{
                    {",".join(upd)}
                  }}
                  Relationships: [
                    {",".join(rels)}
                  ]
                }}"""


def function_entry(db: str, fn: str) -> list[str]:
    rows = q(db, f"select p.oid, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = '{fn}'")
    out = []
    for _oid, args, result in rows:
        parts = []
        for a in [x.strip() for x in args.split(",") if x.strip()] if args else []:
            m = re.match(r"(\w+)\s+(.+?)(\s+DEFAULT\s+.+)?$", a)
            if not m:
                continue
            name, typ, default = m.group(1), m.group(2), m.group(3)
            ts = sql_type_ts(typ)
            parts.append(f'"{name}"{"?" if default else ""}: {ts}{" | null" if default else ""}')
        parts.sort(key=lambda s: s.split('"')[1])
        ret = result_ts(result)
        args_ts = "{ " + ",".join(parts) + " }" if parts else "Record<PropertyKey, never>"
        out.append(f""""{fn}":
{{ Args: {args_ts}; Returns: {ret}
                           }}""")
    return out


def sql_type_ts(typ: str) -> str:
    typ = typ.strip()
    if typ.endswith("[]"):
        base = sql_type_ts(typ[:-2])
        return f"{base}[]"
    return {"uuid": "string", "text": "string", "boolean": "boolean", "integer": "number", "bigint": "number", "smallint": "number",
            "jsonb": "Json", "json": "Json", "numeric": "number", "date": "string", "timestamp with time zone": "string"}.get(typ, "unknown")


def result_ts(result: str) -> str:
    result = result.strip()
    if result == "void":
        return "undefined"
    m = re.match(r"TABLE\((.+)\)", result)
    if m:
        cols = []
        for c in m.group(1).split(","):
            name, typ = c.strip().split(" ", 1)
            cols.append(f'"{name}": {sql_type_ts(typ)}')
        return "{\n              " + ",".join(cols) + "\n            }[]"
    if result.startswith("SETOF "):
        return sql_type_ts(result[6:]) + "[]"
    return sql_type_ts(result)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("db")
    ap.add_argument("--tables", default="")
    ap.add_argument("--functions", default="")
    args = ap.parse_args()
    src = open(TYPES).read()
    tables_start = src.index("          Tables: {")
    views_start = src.index("          Views: {")
    for table in [t for t in args.tables.split(",") if t]:
        entry = table_entry(args.db, table)
        tables_block = src[tables_start:views_start]
        existing = re.search(r'"' + table + r'": \{\n                  Row:.*?\n                  \]\n                \}', tables_block, re.S)
        if existing:
            tables_block = tables_block.replace(existing.group(0), entry)
        else:
            # entra antes do fechamento do bloco Tables
            idx = tables_block.rstrip().rfind("}")
            tables_block = tables_block[:idx].rstrip() + "," + entry + "\n          }\n"
        src = src[:tables_start] + tables_block + src[views_start:]
        views_start = src.index("          Views: {")
    fn_start = src.index("          Functions: {")
    for fn in [f for f in args.functions.split(",") if f]:
        entries = function_entry(args.db, fn)
        block_end = src.index("          Enums: {", fn_start)
        block = src[fn_start:block_end]
        block = re.sub(r'"' + fn + r'":\n\{ Args: .*?\n                           \},?\n?', "", block, flags=re.S)
        insert_at = len("          Functions: {\n")
        block = block[:insert_at] + ",\n".join(entries) + ",\n" + block[insert_at:]
        src = src[:fn_start] + block + src[block_end:]
    open(TYPES, "w").write(src)


if __name__ == "__main__":
    main()
